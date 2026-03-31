# Image Analysis for Course Generation

You are evaluating an image for inclusion in an educational course.

## Course Context
- Topic: {{requirement}}
{{#if subject}}- Subject: {{subject}}{{/if}}
{{#if targetAudience}}- Target Audience: {{targetAudience}}{{/if}}
- Language: {{language}}
{{#if userProfile}}
## Learner Profile
{{userProfile}}
{{/if}}

## Your Task
Analyze the attached image and determine:
1. Is this image pedagogically valuable for the course topic?
2. What does it depict?
3. How relevant is it to the learning objectives?

Consider the learner profile when determining relevance - images should be appropriate for the student's background and knowledge level.

## Output Format (JSON ONLY)
Respond with ONLY a JSON object, no markdown, no explanation:

```json
{
  "include": boolean,
  "rejectionReason": "irrelevant" | "decorative" | "low_quality",
  "description": string,
  "concepts": string[],
  "pedagogical": {
    "contentType": "diagram" | "illustration" | "photograph" | "chart" | "formula" | "map" | "timeline" | "other",
    "complexity": "basic" | "intermediate" | "advanced",
    "relevanceToCourse": string,
    "suggestedPlacement": "central_focus" | "supporting_detail" | "example" | "summary"
  },
  "confidence": "high" | "medium" | "low"
}
```

**Field requirements:**
- `include` (required): `true` to include, `false` to reject
- `rejectionReason` (required if `include: false`): Why it was rejected
- `description` (required if `include: true`): Detailed description of what the image shows
- `concepts` (required if `include: true`): Array of educational concepts illustrated
- `pedagogical` (required if `include: true`): Educational metadata
  - `contentType`: Classification of image type
  - `complexity`: Difficulty level of content
  - `relevanceToCourse`: How specifically this supports the course topic
  - `suggestedPlacement`: Where to position on slide
- `confidence`: Your confidence in this analysis

## Decision Guidelines

**REJECT** (`include: false`) if:
- Logo, header, footer, page decoration
- Purely decorative graphic with no educational content
- Image quality too low to be useful (blurry, unreadable)
- Content completely unrelated to course topic
- Duplicate of another image already analyzed
- Content inappropriate for the target audience

**ACCEPT** (`include: true`) if:
- Illustrates a concept relevant to the course
- Diagram, chart, or visualization with educational value
- Photograph showing relevant subject matter
- Formula, equation, or technical drawing
- Map, timeline, or structured information display

**Be decisive.** When in doubt, reject rather than include marginal content. A course with fewer but highly relevant images is better than one cluttered with irrelevant visuals.

## Content Type Guidelines

- **diagram**: Technical drawings, process flows, system architectures, anatomical drawings
- **illustration**: Artistic renderings, conceptual drawings, explanatory graphics
- **photograph**: Real-world images, specimens, historical photos, examples
- **chart**: Bar charts, line graphs, pie charts, data visualizations
- **formula**: Mathematical equations, chemical formulas, scientific notation
- **map**: Geographic maps, topological maps, location diagrams
- **timeline**: Chronological displays, historical sequences
- **other**: Any other educational visual content

## Complexity Guidelines

- **basic**: Introductory concepts, simple diagrams, foundational knowledge
- **intermediate**: Building on basics, moderate detail, applied concepts
- **advanced**: Complex systems, detailed technical content, expert-level material

## Placement Guidelines

- **central_focus**: Main teaching point, deserves prominent position (diagrams, key illustrations)
- **supporting_detail**: Clarifies or supplements main content (examples, minor diagrams)
- **example**: Concrete instance of abstract concept (photographs, case studies)
- **summary**: Review or synthesis visual (summary diagrams, comparison charts)
