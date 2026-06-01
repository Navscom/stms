import os
import random
import requests
from typing import Optional, Dict, Any, List


class GeminiClient:
    """Lightweight Gemini/Generative Language REST client using API key.

    This avoids depending on a specific Google client package and works with
    an API key stored in the `GEMINI_API_KEY` environment variable.
    """

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required to use GeminiClient.")
        # Default to the Generative Language API base
        self.base_url = base_url or "https://generativelanguage.googleapis.com/v1beta2"

    def generate_text(self, prompt: str, model: str = "models/text-bison-001", temperature: float = 0.2, max_output_tokens: int = 512) -> Dict[str, Any]:
        """Generate text from Gemini/Generative Language API.

        Args:
            prompt: The input prompt text.
            model: Model resource name (e.g. "models/text-bison-001").
        Returns:
            Parsed JSON response from the API.
        """
        url = f"{self.base_url}/{model}:generate"
        params = {"key": self.api_key}
        body = {
            "prompt": {"text": prompt},
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        }
        resp = requests.post(url, params=params, json=body, timeout=30)
        try:
            resp.raise_for_status()
        except Exception:
            # Surface API error details
            raise RuntimeError(f"Gemini API request failed: {resp.status_code} - {resp.text}")
        data = resp.json()
        return data

    def generate_advice(self, nearest: Optional[List[Dict[str, Any]]], danger_nearby: List[Dict[str, Any]], lat: float, lng: float, model: str = "models/text-bison-001") -> Dict[str, Any]:
        """Compose context from nearby destinations and danger pins, call the model, and return advice.

        Returns a dict: { 'advice': str, 'ai_used': bool, 'ai_raw': Optional[dict] }
        """
        # Build context lines
        context_lines: List[str] = []
        if nearest:
            top = nearest[0] if isinstance(nearest[0], dict) else {}
            distance_km = top.get('distance_km', 0)
            # Only include crowd level if within 0.5km
            if distance_km <= 0.5:
                crowd_level = top.get("crowd_level")
                context_lines.append(
                    f"Nearest tourist spot is {top.get('name','Unknown')} in {top.get('city','Unknown')}, {distance_km} km away, current crowd level is {crowd_level}.")
            else:
                context_lines.append(
                    f"Nearest tourist spot is {top.get('name','Unknown')} in {top.get('city','Unknown')}, {distance_km} km away.")
        else:
            context_lines.append("No nearby tourist spots within 2 km.")

        if danger_nearby:
            for d in danger_nearby[:6]:
                if not isinstance(d, dict):
                    continue
                context_lines.append(
                    f"Danger nearby: {d.get('title','Unknown')} is {d.get('distance_km',0)} km away with severity {d.get('severity','unknown')} and note: {d.get('description','')}."
                )
        else:
            context_lines.append("No active danger pins nearby.")

        # Build fallback advice in natural full sentences
        fallback = ""
        if nearest:
            top = nearest[0] if isinstance(nearest[0], dict) else {}
            distance_km = top.get('distance_km', 0)
            cl = top.get("crowd_level")
            crowd_messages = {
                "Low": [
                    "It feels pretty calm, so it should be a good time to visit.",
                    "The spot is quiet right now, which makes it a great time to go.",
                    "It looks peaceful, so you can enjoy it without too much crowding."
                ],
                "Moderate": [
                    "It may be a bit busy, but it should still be manageable.",
                    "There are a fair amount of people, so plan for a little wait.",
                    "It's somewhat lively, but still worth visiting if you go prepared."
                ],
                "High": [
                    "It is crowded right now, so you might want to consider an alternative.",
                    "This place is pretty busy at the moment, so maybe choose somewhere else.",
                    "It feels packed, so be ready for crowds or pick a quieter option."
                ]
            }
            # Only include crowd warning if within 0.5km
            if distance_km <= 0.5:
                crowd_note = random.choice(crowd_messages.get(cl, ["Crowd status is unavailable."])) if isinstance(cl, str) else "Crowd status is unavailable."
                fallback = f"The nearest tourist spot is {top.get('name', 'an unknown place')} in {top.get('city', 'an unknown city')}, about {distance_km} km away. {crowd_note}"
            else:
                fallback = f"The nearest tourist spot is {top.get('name', 'an unknown place')} in {top.get('city', 'an unknown city')}, about {distance_km} km away."
        else:
            fallback = "There are no tourist spots within 2 km nearby right now."
        if danger_nearby:
            first = danger_nearby[0] if isinstance(danger_nearby[0], dict) else {}
            danger_phrases = [
                "Stay alert and keep your distance if you can.",
                "Try to avoid the area if possible and stay aware of your surroundings.",
                "Take one easy safety step: keep moving and stay clear of that spot."
            ]
            safety_note = random.choice(danger_phrases)
            description = str(first.get('description', '')).strip()
            title = str(first.get('title', 'a danger area')).strip()
            if description.lower().startswith(title.lower()):
                description = description[len(title):].strip(' .,-')
            if description:
                fallback += (
                    f" Also, there is a safety concern: {title} "
                    f"({first.get('danger_type', 'unknown')}) about {first.get('distance_km', 0)} km away. "
                    f"{description}. {safety_note}"
                )
            else:
                fallback += (
                    f" Also, there is a safety concern: {title} "
                    f"({first.get('danger_type', 'unknown')}) about {first.get('distance_km', 0)} km away. "
                    f"{safety_note}"
                )

        # If we don't have an API key or generation fails, return fallback
        ai_raw = None
        ai_used = False
        try:
            prompt = (
                "You are a friendly local guide speaking directly to one visitor. Using the context lines below, write one or two natural sentences that feel like a real person talking. "
                "If the crowd level is Low, say that it is a quiet time and the spot is a good choice. "
                "If the crowd level is Moderate, say that it is a bit busy but still manageable. "
                "If the crowd level is High, say that it is crowded and suggest an alternative or caution. "
                "Mention any nearby danger clearly and give one simple safety step if needed. "
                "Use a warm, conversational tone with 'you' and avoid formal or technical phrasing. "
                "Do not mention labels, data fields, or that you are an AI.\n\nContext:\n"
                + "\n".join(context_lines)
                + f"\n\nUser location: lat={lat}, lng={lng}.\nRespond in natural language only."
            )
            ai_raw = self.generate_text(prompt=prompt, model=model)
            if isinstance(ai_raw, dict):
                if "candidates" in ai_raw and isinstance(ai_raw["candidates"], list) and ai_raw["candidates"]:
                    first = ai_raw["candidates"][0]
                    generated_text = first.get("output") or first.get("content") or first.get("text")
                elif "output" in ai_raw:
                    generated_text = ai_raw.get("output")
                else:
                    generated_text = None
            else:
                generated_text = None
            if generated_text:
                generated_text = generated_text.strip()
                if not generated_text.endswith(".") and not generated_text.endswith("!") and not generated_text.endswith("?"):
                    generated_text += "."
                ai_used = True
                return {"advice": generated_text, "ai_used": True, "ai_raw": ai_raw}
        except Exception:
            pass

        return {"advice": fallback, "ai_used": False, "ai_raw": ai_raw}
