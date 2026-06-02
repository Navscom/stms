import os
import random
import logging
from typing import Optional, Dict, Any, List

try:
    import google.genai as genai
except ImportError:
    print("Warning: google-genai not installed. Install with: pip install google-genai")
    genai = None

# Set up logging
logger = logging.getLogger(__name__)


class GeminiClient:
    """Lightweight Gemini client using the google-genai SDK."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required.")
        
        if not genai:
            raise RuntimeError("google-genai package is required. Install with: pip install google-genai")
        
        # The google-genai SDK doesn't need configuration - just pass the API key when creating the client
        self.client = genai.Client(api_key=self.api_key)

    def generate_text(self, prompt: str, model: Optional[str] = None, temperature: float = 0.2, max_output_tokens: int = 1024) -> Dict[str, Any]:
        """Generate text using Gemini API via google-genai SDK.

        Args:
            prompt: The input prompt text.
            model: Model name (e.g. "gemini-3.1-flash"). If None, uses GEMINI_MODEL from .env.
        Returns:
            Dict with response data in consistent format.
        """
        if model is None:
            model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash")
        try:
            debug = os.getenv("DEBUG_GEMINI")
            if debug:
                print(f"[Gemini] Starting generation with model: {model}")
            
            # Use the stored client to generate content
            response = self.client.models.generate_content(
                model=f"models/{model}" if not model.startswith("models/") else model,
                contents=prompt,
                config={
                    "temperature": temperature,
                    "max_output_tokens": max_output_tokens,
                }
            )
            
            if debug:
                print(f"[Gemini] Response received")
                response_text = getattr(response, "text", None)
                if response_text is not None:
                    print(f"[Gemini] Response text: {str(response_text)[:100]}")
                else:
                    print(f"[Gemini] Response object: {response}")
            
            response_text = getattr(response, "text", None)
            if response_text is None and isinstance(response, dict):
                # Try to extract text from dictionary-shaped response
                response_text = response.get("text") or response.get("output")

            return {
                "candidates": [{
                    "content": {
                        "parts": [{
                            "text": str(response_text) if response_text is not None else ""
                        }]
                    }
                }]
            }
        except Exception as e:
            print(f"[Gemini] ERROR: {type(e).__name__}: {str(e)}")
            raise RuntimeError(f"Gemini API request failed: {str(e)}")

    def _extract_text(self, raw_response: Dict[str, Any]) -> str:
        if not isinstance(raw_response, dict):
            return ""
        candidates = raw_response.get("candidates")
        if isinstance(candidates, list) and candidates:
            first = candidates[0]
            if isinstance(first, dict):
                content = first.get("content") or {}
                parts = content.get("parts")
                if isinstance(parts, list) and parts:
                    text = parts[0].get("text")
                    if isinstance(text, str):
                        return text.strip()
        text = raw_response.get("output") or raw_response.get("text")
        return str(text).strip() if text is not None else ""

    def generate_crowdy_marker_description(
        self,
        location_name: str,
        city: str,
        province: str,
        report_count: int,
        unique_user_count: int,
        crowd_level: str,
        model: Optional[str] = None,
    ) -> str:
        if model is None:
            model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash")
        prompt = (
            "You are writing a short, friendly safety marker description for a crowded area. "
            f"Location: {location_name}, {city}, {province}. "
            f"There are {unique_user_count} unique user reports and {report_count} total crowd reports within the last hour. "
            f"The current crowd level is {crowd_level}. "
            "Write one crisp sentence the map should display for a busy area, without mentioning AI, data fields, or labels. "
            "Use a human tone and include a gentle caution for visitors."
        )
        try:
            ai_raw = self.generate_text(prompt=prompt, model=model, temperature=0.4, max_output_tokens=80)
            description = self._extract_text(ai_raw)
            if description:
                return description
        except Exception:
            pass

        return (
            f"{location_name} is busy right now with {unique_user_count} user reports in the past hour. "
            "Use caution and consider a quieter route if possible."
        )

    def generate_advice(self, nearest: Optional[List[Dict[str, Any]]], danger_nearby: List[Dict[str, Any]], wildlife_alerts: Optional[List[Dict[str, Any]]], lat: float, lng: float, model: Optional[str] = None) -> Dict[str, Any]:
        """Compose context from nearby destinations, danger pins, and wildlife alerts, call the model, and return advice.

        Returns a dict: { 'advice': str, 'ai_used': bool, 'ai_raw': Optional[dict] }
        """
        if wildlife_alerts is None:
            wildlife_alerts = []
        # Use environment model or fall back to parameter/default
        if model is None:
            model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash")
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

        if wildlife_alerts:
            for w in wildlife_alerts[:4]:
                if not isinstance(w, dict):
                    continue
                context_lines.append(
                    f"Wildlife alert: {w.get('title','Unknown')} ({w.get('danger_type','wildlife')}) is {w.get('distance_km',0)} km away with severity {w.get('severity','unknown')}. Note: {w.get('description','')}."
                )
        if danger_nearby:
            for d in danger_nearby[:6]:
                if not isinstance(d, dict):
                    continue
                context_lines.append(
                    f"Danger nearby: {d.get('title','Unknown')} is {d.get('distance_km',0)} km away with severity {d.get('severity','unknown')} and note: {d.get('description','')}."
                )
        elif not wildlife_alerts:
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
                "If there is a wildlife alert, call it out as an animal or wildlife warning and suggest avoiding that area. "
                "Use a warm, conversational tone with 'you' and avoid formal or technical phrasing. "
                "Do not mention labels, data fields, or that you are an AI.\n\nContext:\n"
                + "\n".join(context_lines)
                + f"\n\nUser location: lat={lat}, lng={lng}.\nRespond in natural language only."
            )
            ai_raw = self.generate_text(prompt=prompt, model=model)
            generated_text = None
            
            if isinstance(ai_raw, dict):
                # Modern API format: candidates[0].content.parts[0].text
                if "candidates" in ai_raw and isinstance(ai_raw["candidates"], list) and ai_raw["candidates"]:
                    first_candidate = ai_raw["candidates"][0]
                    
                    # Try modern format: content.parts[0].text
                    if "content" in first_candidate and isinstance(first_candidate["content"], dict):
                        parts = first_candidate["content"].get("parts", [])
                        if parts and isinstance(parts[0], dict):
                            generated_text = parts[0].get("text")
                    
                    # Fallback to old format: output/content/text
                    if not generated_text:
                        generated_text = first_candidate.get("output") or first_candidate.get("content") or first_candidate.get("text")
                
                # Try direct root-level keys for backward compatibility
                if not generated_text:
                    generated_text = ai_raw.get("output") or ai_raw.get("text")
            
            if generated_text:
                generated_text = generated_text.strip()
                if not generated_text.endswith(".") and not generated_text.endswith("!") and not generated_text.endswith("?"):
                    generated_text += "."
                ai_used = True
                if os.getenv("DEBUG_GEMINI"):
                    logger.info(f"[Gemini Advice] Generated: {generated_text[:100]}")
                return {"advice": generated_text, "ai_used": True, "ai_raw": ai_raw}
            else:
                if os.getenv("DEBUG_GEMINI"):
                    logger.warning(f"[Gemini Advice] No generated text extracted, falling back")
        except Exception as e:
            if os.getenv("DEBUG_GEMINI"):
                logger.error(f"[Gemini Advice] Exception: {type(e).__name__}: {str(e)}")
            pass

        if os.getenv("DEBUG_GEMINI"):
            logger.warning(f"[Gemini Advice] Using fallback")
        return {"advice": fallback, "ai_used": False, "ai_raw": ai_raw}

    def translate_to_language(
        self,
        text: str,
        target_language: str = "en",
        model: Optional[str] = None,
    ) -> str:
        """Translate safety alert text to the user's preferred language."""
        if not text or target_language.lower() in ["en", "english"]:
            return text
        if model is None:
            model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash")
        prompt = (
            f"Translate this safety alert to {target_language} language. Keep it concise and natural. "
            f"Do NOT add any other text, only the translation:\n\n{text}"
        )
        try:
            ai_raw = self.generate_text(prompt=prompt, model=model, temperature=0.1, max_output_tokens=150)
            translated = self._extract_text(ai_raw)
            if translated:
                return translated
        except Exception:
            pass
        return text

    def moderate_comment(self, comment_text: str, model: Optional[str] = None) -> Dict[str, Any]:
        """Check if a comment should be flagged for moderation."""
        if not isinstance(comment_text, str) or len(comment_text) == 0:
            return {"is_spam": True, "reason": "empty_comment", "confidence": 1.0}

        comment_lower = comment_text.lower().strip()

        if len(comment_text) < 2:
            return {"is_spam": True, "reason": "too_short", "confidence": 1.0}

        if len(comment_text) > 2000:
            return {"is_spam": True, "reason": "too_long", "confidence": 0.8}

        caps_count = sum(1 for c in comment_text if c.isupper())
        caps_ratio = caps_count / len(comment_text) if comment_text else 0
        if caps_ratio > 0.5 and len(comment_text) > 10:
            return {"is_spam": True, "reason": "excessive_caps", "confidence": 0.7}

        if comment_lower.count("http://") + comment_lower.count("https://") > 2:
            return {"is_spam": True, "reason": "too_many_links", "confidence": 0.9}

        common_spam = ["click here", "buy now", "free money", "spam", "viagra", "casino"]
        if any(spam in comment_lower for spam in common_spam):
            return {"is_spam": True, "reason": "spam_keywords", "confidence": 0.85}

        repeated_char = any(comment_text.count(char * 5) > 0 for char in "abcdefghijklmnopqrstuvwxyz!@#")
        if repeated_char:
            return {"is_spam": True, "reason": "excessive_repetition", "confidence": 0.7}

        if model is None:
            model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash")

        try:
            prompt = (
                "Rate this comment for appropriateness on a tourism safety map. "
                "Reply with only YES or NO. YES means it's appropriate, NO means it's spam/inappropriate.\n\n"
                f"Comment: {comment_text}"
            )
            ai_raw = self.generate_text(prompt=prompt, model=model, temperature=0.0, max_output_tokens=10)
            verdict = self._extract_text(ai_raw).strip().upper()
            is_spam = "NO" in verdict
            if is_spam:
                return {"is_spam": True, "reason": "ai_flagged", "confidence": 0.8}
        except Exception:
            pass

        return {"is_spam": False, "reason": "approved", "confidence": 0.95}
