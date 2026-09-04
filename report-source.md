# ShotCoach Comprehensive Prompt Research — Source Report

Audience: ShotCoach product and engineering team
Date: 2026-09-04
Scope: Portrait retake coaching from one live-camera photo, followed by GPT Image 2 reference rendering. Focus is realistic smartphone photography, not editorial restyling.

## Executive answer

The current V7.2 prompt has the right product intent and preservation rules, but it asks the analysis model to produce too many overlapping representations and gives the render model more physical precision than a single-image edit can reliably obey. The strongest optimization is to make the analysis output a compact, structured capture plan; compose the render prompt deterministically; lead with one dominant visual change; use relative photographer actions instead of pseudo-exact geometry; and evaluate the rendered image against the plan before returning it.

## Evidence-backed findings

1. OpenAI recommends a stable order of scene, subject, details, and constraints, with short labeled segments for complex prompts. It also recommends explicitly separating what changes from what remains invariant. Source: [GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide), OpenAI, 2026-04-21.
2. OpenAI states that detailed camera specifications may be interpreted loosely and should primarily guide the high-level look and composition. The guide also lists precise composition control as a remaining limitation. Source: same OpenAI guide and [Image generation API guide](https://developers.openai.com/api/docs/guides/image-generation), accessed 2026-09-04.
3. OpenAI recommends describing people through scale, body framing, gaze, and object interaction, and recommends small single-change iterations instead of overloaded prompts. Source: same OpenAI prompting guide.
4. GPT Image 2 processes image inputs at high fidelity automatically; there is no need to add an input-fidelity prompt workaround. Source: OpenAI Image generation API guide.
5. Google frames effective image prompts as subject, context/background, and style, augmented by photography modifiers such as proximity, camera position, lighting, and lens type. Source: [Imagen prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/img-gen-prompt-guide), Google Cloud, accessed 2026-09-04.
6. Adobe recommends simple, direct wording, and its photography guidance separates pose, framing, camera settings, lighting, and texture. Source: [Writing effective text prompts](https://helpx.adobe.com/firefly/web/work-with-images/generate-images/writing-effective-text-prompts.html), Adobe, updated 2026-06-16.
7. Professional portrait guidance emphasizes lens behavior, camera-subject distance, eye focus, and matching white balance to ambient light. Wide lenses can distort faces; longer lenses require greater working distance. Source: [Quick Tips for Taking Better Portraits](https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/quick-tips-for-taking-better-portraits), Nikon USA.
8. Composition rules should support intent rather than operate as formulas; leading lines, for example, must actually lead toward the subject. Source: [The basics of photography composition](https://www.adobe.com/creativecloud/photography/technique/composition.html), Adobe.
9. Recent pre-shutter planning research argues that pose, camera, lens, lighting, and scene relations are coupled and scene-dependent. Its scene-graph and comparative-planning framing suggests extracting actionable subject-scene affordances and comparing candidate shots before selecting a plan. Source: Jiang and Chen, [Before the Shutter](https://arxiv.org/abs/2605.30318), arXiv, 2026-05-28. This is a preprint and should be treated as promising rather than settled evidence.

## Direct implications for V7.2

- Replace three generated prompt strings with one structured capture plan plus a deterministic render composer.
- Make `primary_change` mandatory and permit only one dominant visual transformation per render.
- Replace pseudo-exact values such as `2–3 degrees` and `20–25% larger` with visible targets such as `nearly level`, `mid-thigh-to-head`, and `face and torso clearly dominant`.
- Retain useful phone controls such as `1x/2x/3x`, but express their photographic purpose: environment, natural portrait compression, or distant compression.
- Add subject-scene affordances: where the subject can stand/sit, safe movement, usable rails/stairs/walls, blockers, clean background directions, and lighting direction.
- Compare at least two plausible shot concepts internally and return one winner. Do not expose multiple competing strategies to the render model.
- Add a render QC pass that compares source, capture plan, and output. Retry once using only the largest mismatch.

## Recommended render template

```text
PURPOSE
Create a photorealistic smartphone retake reference that a real user can reproduce at this location.

PRIMARY CHANGE
<one dominant visible improvement>

CAMERA ACTION
<phone zoom> · <move closer/back/left/right> · <camera height relative to subject> · <level/high/low viewpoint>

FRAME
<shot size> · <subject placement> · <background anchor> · <edge cleanup>

SUBJECT ACTION
<one short sequence of body, hands, head, gaze>

CAPTURE MOMENT
<observable timing cue>

PRESERVE
<identity, outfit, location, weather, existing light>

AVOID
<maximum five likely failure modes>
```

## Proposed QC rubric

- Retake feasibility: 25
- Capture-plan adherence: 25
- Identity/outfit/location/light preservation: 20
- Photographic improvement: 20
- Anatomy and visual artifacts: 10

Hard reject: changed location or lighting character, clear identity drift, impossible pose/contact, or plan-adherence score below 70/100.

## Limitations

A single 2D image cannot reveal all walkable space, occluded geometry, or exact camera-subject distance. Any generated new viewpoint is a plausible visualization, not a geometrically verified preview. Exact fidelity must therefore be measured visually rather than inferred from detailed numeric wording.

## Claim-to-source ledger

| Claim | Source | Publisher/authors | Date | Access notes |
|---|---|---|---|---|
| Structured prompts, explicit invariants, small iterations | GPT Image Generation Models Prompting Guide | OpenAI | 2026-04-21 | Official developer cookbook |
| Camera specifications interpreted loosely; composition remains limited | GPT Image guide and API guide | OpenAI | 2026-04-21 / current | Official documentation |
| Subject/context/style and photography modifiers | Imagen prompt guide | Google Cloud | current | Official documentation |
| Simple direct prompts; pose/framing/light/texture controls | Firefly prompt guidance | Adobe | 2026-06-16 | Official documentation |
| Portrait lens and working-distance behavior | Quick Tips for Better Portraits | Nikon USA | undated | Manufacturer education |
| Composition rules serve intent | Photography composition basics | Adobe | current | Education article with named contributors |
| Coupled pre-shutter planning and scene affordances | Before the Shutter | Ruixiang Jiang, Chang Wen Chen | 2026-05-28 | arXiv preprint; not peer-reviewed in the retrieved record |
