import asyncio
import os
import requests
from typing import Any, Dict, List

from ..app import app
from ..config import MAX_ROUTE_SNAP_RADIUS_METERS, logger
from ..helpers import build_avoid_multipolygon_from_pins, haversine
from ..services import (
    _check_route_through_danger,
    _fetch_active_danger_pins,
    _filter_relevant_route_pins,
    _generate_route_advice,
    _ors_routable_point_error,
)
from fastapi import HTTPException


@app.get("/route")
async def get_route(start_lat: float, start_lng: float, end_lat: float, end_lng: float, profile: str = "foot-walking", avoid_danger: bool = False):
    ors_key = os.getenv("ORS_API_KEY")
    if not ors_key:
        raise HTTPException(status_code=500, detail="ORS_API_KEY environment variable is not configured on the server. Ensure backend/.env contains ORS_API_KEY and restart the server.")

    try:
        url = f"https://api.openrouteservice.org/v2/directions/{profile}/geojson"
        payload: Dict[str, Any] = {
            "coordinates": [[float(start_lng), float(start_lat)], [float(end_lng), float(end_lat)]],
            "radiuses": [MAX_ROUTE_SNAP_RADIUS_METERS, MAX_ROUTE_SNAP_RADIUS_METERS],
        }
        relevant_pins: List[Dict[str, Any]] = []
        try:
            pins = _fetch_active_danger_pins()
            relevant_pins = _filter_relevant_route_pins(start_lat, start_lng, end_lat, end_lng, pins)
            endpoint_inside_danger = False
            relevant_for_avoid: List[Dict[str, Any]] = []
            if avoid_danger:
                relevant_for_avoid = _filter_relevant_route_pins(start_lat, start_lng, end_lat, end_lng, pins, route_buffer_km=0.0)

            if avoid_danger and relevant_for_avoid:
                def _point_in_danger(pin, lat, lng):
                    try:
                        pin_lat = float(pin.get("lat", 0))
                        pin_lng = float(pin.get("lng", 0))
                        pin_radius_km = float(pin.get("radius_meters", 300)) / 1000.0
                    except (TypeError, ValueError):
                        return False
                    return haversine(lat, lng, pin_lat, pin_lng) <= pin_radius_km

                start_pins = [pin for pin in relevant_for_avoid if _point_in_danger(pin, float(start_lat), float(start_lng))]
                end_pins = [pin for pin in relevant_for_avoid if _point_in_danger(pin, float(end_lat), float(end_lng))]

                if start_pins and end_pins:
                    avoid_danger = False
                    endpoint_inside_danger = 'both'
                    relevant_for_avoid = []
                else:
                    if start_pins or end_pins:
                        endpoint_inside_danger = 'start' if start_pins else 'end'
                        excluded_ids = set(p.get('id') for p in (start_pins + end_pins) if isinstance(p, dict) and p.get('id') is not None)
                        relevant_for_avoid = [p for p in relevant_for_avoid if p.get('id') not in excluded_ids]

            if avoid_danger and relevant_for_avoid:
                if len(relevant_for_avoid) > 10:
                    relevant_for_avoid = relevant_for_avoid[:10]
                avoid_geo = build_avoid_multipolygon_from_pins(relevant_for_avoid, points_per_circle=16)
                if avoid_geo:
                    payload["options"] = {"avoid_polygons": avoid_geo}

        except Exception:
            logger.exception("Failed to fetch or filter danger pins for route advice")

        headers = {"Authorization": ors_key, "Content-Type": "application/json"}
        route_error_message = "Route unavailable: the requested route could not be calculated. Please try a different location or try again later."
        try:
            resp = await asyncio.to_thread(requests.post, url, json=payload, headers=headers, timeout=60)
        except Exception:
            raise HTTPException(status_code=400, detail=route_error_message)

        if resp.status_code == 200:
            try:
                data = resp.json()
                if avoid_danger and payload.get("options", {}).get("avoid_polygons"):
                    route_goes_through_danger = _check_route_through_danger(data, relevant_pins)
                    if route_goes_through_danger:
                        logger.warning("Route still goes through danger zones despite avoidance request")
                data["route_advice"] = _generate_route_advice(data, start_lat, start_lng, end_lat, end_lng, relevant_pins, avoid_danger, endpoint_inside_danger=endpoint_inside_danger)
                return data
            except Exception:
                raise HTTPException(status_code=400, detail=route_error_message)

        try:
            response_body = resp.json()
        except Exception:
            response_body = resp.text or ""
        short_body = str(response_body)[:400]
        routable_error_message = _ors_routable_point_error(response_body, short_body)
        if routable_error_message:
            raise HTTPException(status_code=400, detail=routable_error_message)

        if resp.status_code == 404:
            error_message = None
            if isinstance(response_body, dict):
                error_info = response_body.get('error') or {}
                if isinstance(error_info, dict) and 'message' in error_info:
                    error_message = str(error_info.get('message'))
            if not error_message and 'Could not find routable point' in short_body:
                error_message = short_body
            if error_message:
                payload["radiuses"] = [-1, -1]
                try:
                    resp = await asyncio.to_thread(requests.post, url, json=payload, headers=headers, timeout=60)
                except Exception:
                    raise HTTPException(status_code=400, detail=route_error_message)
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        data["route_advice"] = _generate_route_advice(data, start_lat, start_lng, end_lat, end_lng, relevant_pins, avoid_danger, endpoint_inside_danger=endpoint_inside_danger)
                        return data
                    except Exception:
                        raise HTTPException(status_code=400, detail=route_error_message)
                try:
                    response_body = resp.json()
                except Exception:
                    response_body = resp.text or ""
                short_body = str(response_body)[:400]
                routable_error_message = _ors_routable_point_error(response_body, short_body)
                if routable_error_message:
                    raise HTTPException(status_code=400, detail=routable_error_message)
                if avoid_danger and payload.get("options", {}).get("avoid_polygons"):
                    payload.pop("options", None)
                    try:
                        resp = await asyncio.to_thread(requests.post, url, json=payload, headers=headers, timeout=60)
                    except Exception:
                        raise HTTPException(status_code=400, detail=f"{route_error_message} ORS error: {short_body}")
                    if resp.status_code == 200:
                        try:
                            data = resp.json()
                            data["route_advice"] = _generate_route_advice(data, start_lat, start_lng, end_lat, end_lng, relevant_pins, avoid_danger, endpoint_inside_danger=endpoint_inside_danger)
                            return data
                        except Exception:
                            raise HTTPException(status_code=400, detail=f"{route_error_message} ORS response invalid: {short_body}")
                    try:
                        response_body = resp.json()
                    except Exception:
                        response_body = resp.text or ""
                    short_body = str(response_body)[:400]
                    routable_error_message = _ors_routable_point_error(response_body, short_body)
                    if routable_error_message:
                        raise HTTPException(status_code=400, detail=routable_error_message)
                raise HTTPException(status_code=400, detail=f"{route_error_message} ORS status {resp.status_code}: {short_body}")
            raise HTTPException(status_code=400, detail="The selected location is too far from any accessible roads or walking paths. Please choose a location on or near a road, street, or path to calculate a route.")

        if avoid_danger and payload.get("options", {}).get("avoid_polygons"):
            payload.pop("options", None)
            try:
                resp = await asyncio.to_thread(requests.post, url, json=payload, headers=headers, timeout=60)
            except Exception:
                raise HTTPException(status_code=400, detail=f"{route_error_message} ORS error: {short_body}")
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    data["route_advice"] = _generate_route_advice(data, start_lat, start_lng, end_lat, end_lng, relevant_pins, avoid_danger, endpoint_inside_danger=endpoint_inside_danger)
                    return data
                except Exception:
                    raise HTTPException(status_code=400, detail=f"{route_error_message} ORS response invalid: {short_body}")
            try:
                response_body = resp.json()
            except Exception:
                response_body = resp.text or ""
            short_body = str(response_body)[:400]
            routable_error_message = _ors_routable_point_error(response_body, short_body)
            if routable_error_message:
                raise HTTPException(status_code=400, detail=routable_error_message)
        raise HTTPException(status_code=400, detail=f"{route_error_message} ORS status {resp.status_code}: {short_body}")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to fetch route from OpenRouteService")
        raise HTTPException(status_code=500, detail=str(e))
