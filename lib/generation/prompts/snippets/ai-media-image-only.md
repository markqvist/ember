### AI-Generated Images

When a slide scene needs an image but no suitable PDF image exists, mark it for AI generation:

- Add a `mediaGenerations` array to the scene outline with `type: "image"` entries
- Each entry specifies: `type` ("image"), `prompt` (description for the generation model), `elementId` (unique placeholder), and optionally `aspectRatio` (default "16:9") and `style`
- **Image IDs**: use `"gen_img_1"`, `"gen_img_2"`, etc. — IDs are **globally unique across the entire course**, NOT reset per scene
- The prompt should describe the desired image clearly and specifically
- **Language in images**: If the image contains text, labels, or annotations, the prompt MUST explicitly specify that all text in the image should be in the course language (e.g., "all labels in Chinese" for zh-CN courses, "all labels in English" for en-US courses). For purely visual images without text, language does not matter.
- Only request image generation when it genuinely enhances the content — not every slide needs an image
- If a suitable PDF image exists, prefer using `suggestedImageIds` instead
- **Avoid duplicate images across slides**: Each generated image must be visually distinct. Do NOT request near-identical images for different slides (e.g., two "diagram of cell structure" images). If multiple slides cover the same topic, vary the visual angle, scope, or style
- **Cross-scene reuse**: To reuse a generated image in a different scene, reference the same `elementId` in the later scene's content WITHOUT adding a new `mediaGenerations` entry. Only the scene that first defines the `elementId` in its `mediaGenerations` should include the generation request — later scenes just reference the ID. For example, if scene 1 defines `gen_img_1`, scene 3 can also use `gen_img_1` as an image src without declaring it again in mediaGenerations
- **Video generation is NOT available**: Do NOT include any video mediaGenerations (type: "video") in the outlines

**Content safety guidelines for image prompts** (to avoid being blocked by the generation model's safety filter):

- Do NOT describe specific human facial features, body details, or physical appearance — use abstract or iconographic representations (e.g., "a silhouette of a person" instead of detailed descriptions)
- Do NOT include violence, weapons, blood, or gore
- Do NOT reference politically sensitive content: national flags, military imagery, or real political figures
- Do NOT depict real public figures or celebrities by name or likeness
- Prefer abstract, diagrammatic, infographic, or icon-based styles for educational illustrations
- Keep all prompts academic and education-oriented in tone

Image example:

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