Generate scene outlines based on the following course requirements.

---

## User Requirements

{{requirement}}

---

{{userProfile}}

## Course Language

**Required language**: {{language}}

---

## Reference Materials

### PDF Content Summary

{{pdfContent}}

### Available Images (Semantically Analyzed)

{{availableImages}}

**Image Selection Guidelines:**
- Only select images where `include: true` (these have passed pedagogical relevance review)
- Match image `concepts` to your scene's `keyPoints` for optimal alignment
- Use `suggestedPlacement` to guide how the image should be integrated:
  - `central_focus`: Use for key diagrams, main illustrations (prominent position)
  - `supporting_detail`: Use for clarifying examples, minor diagrams
  - `example`: Use for photographs showing concrete instances
  - `summary`: Use for review visuals, comparison charts
- Consider `complexity` relative to target audience - match basic/intermediate/advanced appropriately
- Images marked `include: false` have been rejected as irrelevant, decorative, or low quality - do not use them
- If no suitable images exist for a scene, generate content without images (do not force irrelevant images)

### Research Results

{{researchContext}}

---

### Teacher Persona

{{teacherContext}}

---

## Output Requirements

Carefully analyze the requirement text to understand:

- Course topic and core content
- Target audience and difficulty level
- Course duration (default 15-30 minutes if not specified)
- Teaching style (formal/casual/interactive/academic)
- Visual style (minimal/colorful/professional/playful)

Then output a JSON array containing all scene outlines. Each scene must include:

```json
{
  "id": "scene_1",
  "type": "slide" or "quiz" or "interactive",
  "title": "Scene Title",
  "description": "Teaching purpose description",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "order": 1
}
```

### Special Notes

1. **quiz scenes must include quizConfig**:
   ```json
   "quizConfig": {
     "questionCount": 2,
     "difficulty": "easy" | "medium" | "hard",
     "questionTypes": ["single", "multiple"]
   }
   ```
2. **If images are available**, add `suggestedImageIds` to relevant slide scenes
3. **Interactive scenes**: If a concept benefits from hands-on simulation/visualization, use `"type": "interactive"` with an `interactiveConfig` object containing `conceptName`, `conceptOverview`, `designIdea`, and `subject`. Limit to 1-2 per course.
4. **Scene count**: Based on inferred duration, typically 2-4 minutes per scene
5. **Quiz placement**: If applicable, insert a quiz every 3-5 slides for anchoring of knowledge and conceptual connection building
6. **Language**: Output all content in the specified course language
7. **If research results are provided**, reference specific findings and sources in scene descriptions and keyPoints. The search results provide up-to-date information — incorporate it to make the course content current and accurate.

Output the final JSON array directly without additional explanatory text.
