# ShotCoach AI Backend: Mobile Integration Guide

Tài liệu này mô tả cách app mobile gọi backend production hiện tại để:

- phân tích ảnh (`analyze`)
- lấy gợi ý coach theo mode (`composition`, `frame`, `angle`, `pose`, `comprehensive`)
- tạo ảnh reference bằng AI (`direct-edit`, `images/edit`)

## 1. Base URL production

```txt
https://shotcoachai-backend.vercel.app
```

## 2. Auth và header

Hiện tại backend chưa yêu cầu auth token.

Mọi request dùng:

```http
Content-Type: application/json
```

## 3. Quy ước dữ liệu ảnh

Mobile gửi ảnh dưới dạng:

- `imageBase64`: chuỗi base64 thuần
- Không gửi prefix kiểu `data:image/jpeg;base64,...`
- `mimeType`: `image/jpeg`, `image/png`, hoặc `image/webp`

Khuyến nghị app:

- resize ảnh trước khi gửi
- ưu tiên `jpeg` nếu không cần alpha
- nén vừa phải để request nhẹ hơn
- nếu ảnh quá lớn, hãy giảm kích thước trước khi base64

## 4. Flow mobile được khuyến nghị

### Flow A: phân tích ảnh và hiển thị gợi ý coach

1. User chọn/chụp ảnh
2. Mobile resize + encode base64
3. Gọi `POST /api/v1/coach/analyze`
4. Hiển thị:
   - `overallAssessment`
   - `coachAnalysisV2.scores`
   - `coachDirectionsV2`
   - `suggestions`
5. Khi user chọn một suggestion, app có thể:
   - chỉ hiển thị text guidance
   - hoặc gọi `POST /api/v1/images/edit` để tạo ảnh reference theo `suggestion.image_prompt`

### Flow B: tạo nhanh một ảnh reference theo mode

1. User chọn ảnh
2. Gọi `POST /api/v1/coach/direct-edit`
3. Nhận `generatedImageBase64`
4. Decode base64 thành ảnh để render trong app

Flow này phù hợp cho nút kiểu `Try pose fix`, `Try better angle`, `Show me reference`.

### Flow C: tạo ảnh theo prompt đã chọn

1. Gọi `POST /api/v1/coach/analyze`
2. User chọn 1 suggestion
3. Lấy `suggestion.image_prompt`
4. Gọi `POST /api/v1/images/edit`
5. Nhận `generatedImageBase64`

Flow này cho kết quả sát với direction đã phân tích hơn `direct-edit`.

## 5. Endpoint 1: Analyze

### URL

```txt
POST /api/v1/coach/analyze
```

### Mục đích

- phân tích ảnh
- trả điểm và nhận xét
- trả danh sách suggestion để mobile hiển thị
- hỗ trợ `v1` và `v2`, nhưng mobile mới nên dùng `v2`

### Request body

```json
{
  "imageBase64": "<base64 string>",
  "mimeType": "image/jpeg",
  "toolId": "ai_coach",
  "coachMode": "pose",
  "coachPreferences": {
    "gender": "male",
    "ageRange": "18_24",
    "sceneContext": "nature",
    "editIntensity": "safe"
  },
  "flowVersion": "v2",
  "originalImageUri": "ph://local-photo-id",
  "originalImageMimeType": "image/jpeg"
}
```

### Field rules

- `imageBase64`: bắt buộc
- `mimeType`: optional, default `image/jpeg`
- `toolId`: optional, default `ai_coach`
- `coachMode`: optional, default `comprehensive`
- `flowVersion`: optional, default `v2`
- `originalImageUri`: optional, default `source_photo`

### `coachMode` supported values

- `composition`
- `frame`
- `angle`
- `pose`
- `comprehensive`

### `coachPreferences` supported values

- `gender`: `female` | `male` | `non_binary`
- `ageRange`: `under_18` | `18_24` | `25_34` | `35_44` | `45_plus`
- `sceneContext`: `travel` | `street` | `cafe` | `beach` | `nature` | `urban_night` | `indoor` | `restaurant` | `landmark`
- `editIntensity`: `safe` | `balanced` | `aggressive`

### Response shape

```json
{
  "analysisId": "coach-v2:1785892979715",
  "flowType": "aiCoach",
  "overallAssessment": "A naturally composed casual portrait...",
  "suggestions": [
    {
      "title": "Enhance Natural Stance with Slight Weight Shift and Hand Adjustment",
      "concept": "Shift your weight subtly onto your right leg...",
      "composition": "Maintain the current framing...",
      "camera_angle": "Keep camera distance constant...",
      "changes": [
        "Move subject slightly off-center...",
        "Subtle weight shift to one leg..."
      ],
      "image_prompt": "Edit the uploaded photo as a realistic ShotCoach AI photography coaching reference..."
    }
  ],
  "coachAnalysisV2": {
    "schema_version": "2.0",
    "scene": {},
    "subject": {},
    "composition": {},
    "lighting": {},
    "pose": {},
    "aesthetic": {},
    "scores": {
      "composition_score": 7,
      "lighting_score": 6,
      "pose_score": 6,
      "subject_separation_score": 7,
      "naturalness_score": 7,
      "social_media_score": 6,
      "overall_aesthetic_score": 6
    },
    "overall_assessment": "..."
  },
  "coachDirectionsV2": [
    {
      "id": "pose_refine_weight_hand",
      "title": "Enhance Natural Stance with Slight Weight Shift and Hand Adjustment",
      "summary": "Shift your weight subtly...",
      "composition_change": "...",
      "camera_distance_change": "...",
      "subject_placement_change": "...",
      "pose_refinement": "...",
      "lighting_preservation": "...",
      "edit_strength": "low",
      "identity_risk": "low",
      "prompt_builder_notes": []
    }
  ],
  "originalImageUri": "ph://local-photo-id",
  "originalImageMimeType": "image/jpeg",
  "createdAt": "2026-08-05T01:22:32.934Z"
}
```

### Mobile nên dùng field nào

- Card tổng quan:
  - `overallAssessment`
- Score UI:
  - `coachAnalysisV2.scores`
- Detail screen:
  - `coachAnalysisV2.composition`
  - `coachAnalysisV2.lighting`
  - `coachAnalysisV2.pose`
  - `coachAnalysisV2.aesthetic`
- Suggestion list:
  - `suggestions[]`
- Advanced coach sheet:
  - `coachDirectionsV2[]`

## 6. Endpoint 2: Direct Edit

### URL

```txt
POST /api/v1/coach/direct-edit
```

### Mục đích

Tạo nhanh một ảnh reference theo `coachMode`, không cần qua bước chọn suggestion.

### Request body

```json
{
  "imageBase64": "<base64 string>",
  "mimeType": "image/jpeg",
  "coachMode": "pose",
  "coachPreferences": {
    "gender": "male",
    "ageRange": "18_24",
    "sceneContext": "nature",
    "editIntensity": "safe"
  }
}
```

### Response shape

```json
{
  "generatedImageBase64": "<base64 png>",
  "promptUsed": "User context (shooting context: nature)...",
  "model": "gpt-image-1",
  "size": "1024x1536"
}
```

### Mobile render ảnh như thế nào

- decode `generatedImageBase64` thành bytes
- tạo image object native
- hiển thị như ảnh bình thường
- có thể cache local theo hash của request nếu muốn

## 7. Endpoint 3: Prompt-based Image Edit

### URL

```txt
POST /api/v1/images/edit
```

### Mục đích

Tạo ảnh từ prompt cụ thể. Đây là endpoint nên dùng sau khi user đã chọn một suggestion từ `analyze`.

### Request body tối thiểu

```json
{
  "imageBase64": "<base64 string>",
  "mimeType": "image/jpeg",
  "prompt": "<suggestion.image_prompt>",
  "toolId": "ai_coach"
}
```

### Request body đầy đủ

```json
{
  "imageBase64": "<base64 string>",
  "mimeType": "image/jpeg",
  "prompt": "<suggestion.image_prompt>",
  "toolId": "ai_coach",
  "evaluateQuality": true,
  "selectedDirection": {
    "title": "Enhance Natural Stance with Slight Weight Shift and Hand Adjustment"
  },
  "originalImageBase64": "<same original base64>"
}
```

### `toolId` known values

- `ai_coach`
- `enhance_photo`
- `better_composition`
- `light_color`
- `restore_color`
- `upscale`
- `background_boost`
- `expand_frame`
- `replace_background`
- `remove_object`
- `smooth_skin`
- `photo_recipe`

### Response shape

```json
{
  "generatedImageBase64": "<base64 png>",
  "model": "gpt-image-1",
  "size": "1024x1536",
  "toolId": "ai_coach",
  "promptUsed": "Edit the uploaded photo as a realistic ShotCoach AI photography coaching reference...",
  "qualityEvaluation": {
    "identity_preservation": 9,
    "naturalness": 8,
    "anatomy_score": 8,
    "overall_score": 8,
    "retry_required": false,
    "retry_reason": "",
    "recommended_action": "accept"
  }
}
```

### Khi nào bật `evaluateQuality`

Bật khi app cần:

- auto-retry logic
- gating trước khi show ảnh
- hiển thị badge chất lượng

Nếu chỉ cần ảnh nhanh, có thể để `false`.

## 8. Error contract

Mọi lỗi trả về theo format:

```json
{
  "error": {
    "message": "Invalid request body",
    "details": {}
  }
}
```

### HTTP status thường gặp

- `200`: thành công
- `400`: payload sai hoặc thiếu field
- `500`: lỗi xử lý AI / upstream / parsing

### Mobile handling được khuyến nghị

- `400`: không retry tự động, log request id nội bộ nếu có
- `500`: cho phép retry thủ công
- timeout client: show loading + cancel option

## 9. Latency và UX

Từ các test production hiện tại:

- `analyze`: thường mất khoảng vài giây tới vài chục giây
- `direct-edit` / `images/edit`: thường chậm hơn `analyze`

Khuyến nghị UX:

- luôn có loading state riêng cho `Analyze` và `Generate`
- nếu `Generate` lâu, hiển thị text như `Creating reference image...`
- không block toàn bộ màn hình nếu user còn có thể quay lại

## 10. Mapping UI đề xuất cho mobile

### Analyze result screen

- Hero summary: `overallAssessment`
- Score chips:
  - `composition_score`
  - `lighting_score`
  - `pose_score`
  - `overall_aesthetic_score`
- Section `What to improve`:
  - `composition.safe_improvements`
  - `pose.safe_pose_refinements`
- Section `Avoid`:
  - `composition.avoid_changes`
  - `pose.unsafe_pose_changes`
- Suggestions carousel:
  - `suggestions[]`

### Suggestion detail screen

- Title: `suggestion.title`
- Concept: `suggestion.concept`
- Bullet list: `suggestion.changes`
- CTA 1: `Generate reference`
- CTA 2: `Try direct coach`

## 11. Client-side checklist

- resize ảnh trước khi base64
- không gửi data URL prefix
- set `coachMode` đúng với màn user đang chọn
- dùng `flowVersion: "v2"` cho flow mới
- parse response nullable an toàn
- `generatedImageBase64` có thể lớn, tránh log toàn bộ string
- không persist raw base64 vào analytics/crash logs

## 12. JSON models gợi ý cho mobile

### Analyze request

```json
{
  "imageBase64": "string",
  "mimeType": "string",
  "toolId": "string",
  "coachMode": "string",
  "coachPreferences": {
    "gender": "string",
    "ageRange": "string",
    "sceneContext": "string",
    "editIntensity": "string"
  },
  "flowVersion": "string",
  "originalImageUri": "string",
  "originalImageMimeType": "string"
}
```

### Analyze response fields tối thiểu nên map

```json
{
  "analysisId": "string",
  "overallAssessment": "string",
  "suggestions": [],
  "coachAnalysisV2": {
    "scores": {}
  },
  "coachDirectionsV2": [],
  "createdAt": "string"
}
```

### Image edit response

```json
{
  "generatedImageBase64": "string",
  "model": "string",
  "size": "string",
  "promptUsed": "string"
}
```

## 13. cURL mẫu

### Analyze

```bash
curl -X POST https://shotcoachai-backend.vercel.app/api/v1/coach/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageBase64": "<base64>",
    "mimeType": "image/jpeg",
    "coachMode": "pose",
    "coachPreferences": {
      "gender": "male",
      "ageRange": "18_24",
      "sceneContext": "nature",
      "editIntensity": "safe"
    },
    "flowVersion": "v2"
  }'
```

### Direct edit

```bash
curl -X POST https://shotcoachai-backend.vercel.app/api/v1/coach/direct-edit \
  -H "Content-Type: application/json" \
  -d '{
    "imageBase64": "<base64>",
    "mimeType": "image/jpeg",
    "coachMode": "pose"
  }'
```

### Prompt-based edit

```bash
curl -X POST https://shotcoachai-backend.vercel.app/api/v1/images/edit \
  -H "Content-Type: application/json" \
  -d '{
    "imageBase64": "<base64>",
    "mimeType": "image/jpeg",
    "prompt": "<suggestion.image_prompt>",
    "toolId": "ai_coach"
  }'
```

## 14. Backend behavior hiện tại cần mobile biết

- backend không yêu cầu auth
- backend nhận base64 trực tiếp
- `analyze` là text + structured output
- `direct-edit` và `images/edit` trả ảnh bằng `generatedImageBase64`
- output image hiện tại đang dùng model `gpt-image-1`
- output size hiện tại mặc định là `1024x1536`

## 15. Recommendation ngắn cho app team

Nếu muốn ship nhanh:

1. Implement `analyze`
2. Render `overallAssessment`, scores, `suggestions`
3. Khi user bấm `Generate`, gọi `images/edit` với `suggestion.image_prompt`

Nếu muốn UX đơn giản hơn:

1. Bỏ qua suggestion detail
2. Dùng luôn `direct-edit` theo `coachMode`

