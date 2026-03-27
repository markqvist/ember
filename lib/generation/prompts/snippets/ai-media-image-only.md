### AI-Generated Images

When a slide scene needs an image but no suitable PDF image exists, mark it for AI generation:

- **If no suitable PDF images exist** for a slide scene that would benefit from visuals, add `mediaGenerations` array with image generation prompts. Write prompts in English. Use `elementId` format like "gen_img_1", "gen_img_2" — IDs must be **globally unique across all scenes** (do NOT restart numbering per scene). To reuse a generated image in a different scene, reference the same elementId without re-declaring it in mediaGenerations. Each generated image should be visually distinct — avoid near-identical media across slides.
- Add a `mediaGenerations` array to the scene outline with `type: "image"` entries
- Each entry specifies: `type` ("image"), `prompt` (description for the generation model), `elementId` (unique placeholder), and optionally `aspectRatio` (default "16:9") and `style`
- **Image IDs**: use `"gen_img_1"`, `"gen_img_2"`, etc. — IDs are **globally unique across the entire course**, NOT reset per scene
- The prompt should describe the desired image clearly and specifically
- Only request image generation when it genuinely enhances the content — not every slide needs an image
- If a suitable PDF image exists, prefer using `suggestedImageIds` instead
- **Avoid duplicate images across slides**: Each generated image must be visually distinct. Do NOT request near-identical images for different slides (e.g., two "diagram of cell structure" images). If multiple slides cover the same topic, vary the visual angle, scope, or style
- **Cross-scene reuse**: To reuse a generated image in a different scene, reference the same `elementId` in the later scene's content WITHOUT adding a new `mediaGenerations` entry. Only the scene that first defines the `elementId` in its `mediaGenerations` should include the generation request — later scenes just reference the ID. For example, if scene 1 defines `gen_img_1`, scene 3 can also use `gen_img_1` as an image src without declaring it again in mediaGenerations
- **Video generation is NOT available**: Do NOT include any video mediaGenerations (type: "video") in the outlines

**Content guidelines for image prompts**

- Do NOT include violence, weapons, blood, or gore
- Prefer abstract, diagrammatic, infographic, or icon-based styles for educational illustrations
- Keep all prompts academic and education-oriented in tone

#### Image example:

```json
"mediaGenerations": [
  {
    "type": "image",
    "prompt": "A colorful diagram showing the water cycle with evaporation, condensation, and precipitation arrows",
    "elementId": "gen_img_1",
    "aspectRatio": "16:9"
  }
]
```