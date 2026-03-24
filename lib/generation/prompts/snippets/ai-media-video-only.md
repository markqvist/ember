### AI-Generated Videos

When a slide scene needs a video to demonstrate motion or dynamic processes, mark it for AI generation:

- Add a `mediaGenerations` array to the scene outline with `type: "video"` entries
- Each entry specifies: `type` ("video"), `prompt` (description for the generation model), `elementId` (unique placeholder), and optionally `aspectRatio` (default "16:9") and `style`
- **Video IDs**: use `"gen_vid_1"`, `"gen_vid_2"`, etc. — IDs are **globally unique across the entire course**, NOT reset per scene
- The prompt should describe the desired video clearly and specifically
- Only request video generation when it genuinely enhances the content — not every slide needs a video
- Video generation is slow (1-2 minutes each), so only request videos when motion genuinely enhances understanding
- If a suitable PDF image exists for static content, prefer using `suggestedImageIds` instead of generating a video
- **Avoid duplicate videos across slides**: Each generated video must be visually distinct. Do NOT request near-identical videos for different slides
- **Cross-scene reuse**: To reuse a generated video in a different scene, reference the same `elementId` in the later scene's content WITHOUT adding a new `mediaGenerations` entry. Only the scene that first defines the `elementId` in its `mediaGenerations` should include the generation request — later scenes just reference the ID
- **Image generation is NOT available**: Do NOT include any image mediaGenerations (type: "image") in the outlines. Use `suggestedImageIds` for any PDF-extracted images, or create slides without images

**Content safety guidelines for video prompts** (to avoid being blocked by the generation model's safety filter):

- Do NOT describe specific human facial features, body details, or physical appearance — use abstract or iconographic representations (e.g., "a silhouette of a person" instead of detailed descriptions)
- Do NOT include violence, weapons, blood, or gore
- Do NOT reference politically sensitive content: national flags, military imagery, or real political figures
- Do NOT depict real public figures or celebrities by name or likeness
- Prefer abstract, diagrammatic, infographic, or icon-based styles for educational illustrations
- Keep all prompts academic and education-oriented in tone

**When to use video**:

- Use **video** for content that benefits from motion/animation: physical processes, step-by-step demonstrations, biological movements, chemical reactions, mechanical operations
- Use `suggestedImageIds` for static content: diagrams, charts, illustrations
- Video generation takes 1-2 minutes, so use it sparingly and only when motion is essential

Video example:

```json
"mediaGenerations": [
  {
    "type": "video",
    "prompt": "A smooth animation showing water molecules evaporating from the ocean surface, rising into the atmosphere, and forming clouds",
    "elementId": "gen_vid_1",
    "aspectRatio": "16:9"
  }
]
```