## Output Format

You must output a JSON array where each element is a scene outline object:

```json
[
  {
    "id": "scene_1",
    "type": "slide",
    "title": "Scene Title",
    "description": "1-2 sentences describing the teaching purpose",
    "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
    "teachingObjective": "Corresponding learning objective",
    "estimatedDuration": 120,
    "order": 1,
    "suggestedImageIds": ["img_1"]
  },
  {
    "id": "scene_2",
    "type": "interactive",
    "title": "Interactive Exploration",
    "description": "Students explore the concept through hands-on interactive visualization",
    "keyPoints": ["Interactive element 1", "Observable phenomenon"],
    "order": 2,
    "interactiveConfig": {
      "conceptName": "Concept Name",
      "conceptOverview": "Brief description of what this interactive demonstrates",
      "designIdea": "Describe the interactive elements: sliders, drag handles, animations, etc.",
      "subject": "Physics"
    }
  },
  {
    "id": "scene_3",
    "type": "quiz",
    "title": "Knowledge Check",
    "description": "Test student understanding of XX concept",
    "keyPoints": ["Test point 1", "Test point 2"],
    "order": 3,
    "quizConfig": {
      "questionCount": 2,
      "difficulty": "medium",
      "questionTypes": ["single", "multiple", "short_answer"]
    }
  }
]
```

### Field Descriptions

| Field             | Type                     | Required | Description                                                                                      |
| ----------------- | ------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| id                | string                   | ✅       | Unique identifier, format: `scene_1`, `scene_2`...                                               |
| type              | string                   | ✅       | `"slide"`, `"quiz"`, `"interactive"`, or `"pbl"`                                                 |
| title             | string                   | ✅       | Scene title, concise and clear                                                                   |
| description       | string                   | ✅       | 1-2 sentences describing teaching purpose                                                        |
| keyPoints         | string[]                 | ✅       | 3-5 core points                                                                                  |
| teachingObjective | string                   | ❌       | Corresponding learning objective                                                                 |
| estimatedDuration | number                   | ❌       | Estimated duration (seconds)                                                                     |
| order             | number                   | ✅       | Sort order, starting from 1                                                                      |
| suggestedImageIds | string[]                 | ❌       | Suggested image IDs to use                                                                       |
| quizConfig        | object                   | ❌       | Required for quiz type, contains questionCount/difficulty/questionTypes                          |
| interactiveConfig | object                   | ❌       | Required for interactive type, contains conceptName/conceptOverview/designIdea/subject           |
| pblConfig         | object                   | ❌       | Required for pbl type, contains projectTopic/projectDescription/targetSkills/issueCount/language |
