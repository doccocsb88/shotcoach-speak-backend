# Tối ưu prompt ShotCoach cho ảnh reference chụp lại

Ngày nghiên cứu: 04/09/2026
Phạm vi: flow `comprehensive`, ảnh chân dung từ live camera, phân tích một ảnh rồi tạo reference bằng GPT Image 2.

## Kết luận

Prompt hiện tại đang đúng về tư duy nhiếp ảnh nhưng quá nặng về specification. Nó yêu cầu model phân tích tạo ba prompt dài và truyền nhiều con số vật lý sang bước render. Với image model, nhiều con số không đồng nghĩa với khả năng điều khiển tốt hơn.

Kiến trúc nên chuyển từ:

```text
Ảnh → phân tích dài → generation_prompt + safe_render_prompt + text2image_prompt → render
```

sang:

```text
Ảnh → capture plan có cấu trúc → code dựng một render prompt ngắn → render → visual QC → tối đa một retry
```

OpenAI khuyến nghị prompt phức tạp dùng thứ tự ổn định, các đoạn có nhãn ngắn, nêu rõ phần cần thay đổi và phần phải giữ. Họ cũng lưu ý thông số camera chi tiết có thể chỉ được hiểu tương đối và composition placement vẫn là một hạn chế của model. Vì vậy ShotCoach nên ưu tiên một visual target rõ hơn là nhiều thông số cùng lúc. Xem [GPT Image 2 prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide) và [Image generation API guide](https://developers.openai.com/api/docs/guides/image-generation).

## Sáu bài học áp dụng trực tiếp

### 1. Một ảnh reference chỉ nên có một thay đổi chủ đạo

`comprehensive` vẫn có thể xét mọi khía cạnh, nhưng output phải chọn một primary change, ví dụ:

- tăng prominence của chủ thể;
- hạ camera xuống ngang eo;
- chuyển sang pose có chuyển động;
- dùng symmetry của cầu thang.

Các thay đổi phụ chỉ được phép hỗ trợ thay đổi chính. Đây cũng phù hợp với khuyến nghị của OpenAI về iterative prompting và single-change refinement.

### 2. Dùng ngôn ngữ nhìn thấy được thay cho độ chính xác giả

Không nên phụ thuộc vào:

- `aim upward 2–3 degrees`;
- `increase face scale 20–25%`;
- `stand 4–5 meters away`.

Nên dùng:

- `giữ điện thoại gần ngang, không chĩa từ trên xuống`;
- `crop từ giữa đùi tới đầu, mặt và torso là trọng tâm`;
- `bật 2x rồi lùi cho tới khi đạt crop này`.

OpenAI nói camera specs chi tiết có thể được model diễn giải lỏng; Nikon cũng cho thấy focal length và working distance liên quan nhau, nên chỉ nói `2x` mà không gắn với framing target là chưa đủ. [OpenAI guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide), [Nikon portrait guidance](https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/quick-tips-for-taking-better-portraits).

### 3. Pose phải là chuỗi hành động, không phải danh sách giải phẫu

Tốt:

```text
Giữ tư thế ngồi, dồn trọng lượng về hông sau, thả vai, đặt tay phải nhẹ trên cát, quay đầu về phía biển và nhìn ngay cạnh camera.
```

Kém hiệu quả hơn:

```text
hips 20°, shoulders 10–15°, front leg..., back leg..., left arm..., right arm...
```

OpenAI khuyến nghị mô tả body framing, gaze và tương tác vật thể cụ thể. Chuỗi động từ ngắn vừa dễ render vừa có thể chuyển thành tip cho người thật.

### 4. Phân tích scene affordance trước khi chọn shot

Ngoài `scene_assets`, cần nhận diện:

- vị trí có thể đứng/ngồi;
- bề mặt có thể tựa hoặc tương tác;
- hướng có background sạch;
- vật cản ở mép ảnh;
- chuyển động an toàn có thể thực hiện;
- hướng ánh sáng hiện tại.

Nghiên cứu [Before the Shutter](https://arxiv.org/abs/2605.30318) xem pose, camera, light và quan hệ subject–scene là một bài toán phối hợp, đồng thời dùng comparative planning thay vì sửa trực tiếp một ảnh 2D. Đây là hướng rất gần với mục tiêu ShotCoach, dù paper hiện là preprint.

### 5. Composition rule phải phục vụ visual intent

Không nên yêu cầu model chọn từ danh sách dài `rule of thirds | golden ratio | leading lines | symmetry...`. Hãy yêu cầu:

```text
Chọn đúng một cấu trúc giúp mắt người xem đi tới chủ thể; giải thích scene element nào tạo cấu trúc đó.
```

Adobe lưu ý các quy tắc composition không phải thuật toán; leading lines chỉ có giá trị nếu thực sự dẫn về chủ thể. [Adobe composition guide](https://www.adobe.com/creativecloud/photography/technique/composition.html).

### 6. Tách capture plan khỏi render prose

Analysis model chỉ nên trả dữ liệu có cấu trúc. Code backend dựng prompt cuối để tránh ba prompt tự mâu thuẫn và giảm schema failure.

Schema đề xuất:

```json
{
  "shot_type": "three_quarter_portrait",
  "primary_change": "make_face_and_torso_dominant",
  "why": "lower body and foreground currently overpower the face",
  "camera": {
    "zoom": "2x",
    "move": "step_back_until_target_frame",
    "height": "subject_waist",
    "viewpoint": "nearly_level"
  },
  "frame": {
    "body_crop": "mid_thigh_to_head",
    "subject_position": "left_third",
    "gaze_space": "right",
    "background_anchor": "level_ocean_horizon_behind_shoulder"
  },
  "subject_action": "remain seated; settle on rear hip; relax shoulders; turn head toward ocean; look just past camera",
  "capture_cue": "press shutter as a light breeze lifts a few strands without covering the eyes",
  "preserve": ["identity", "outfit", "beach", "warm side light"],
  "avoid": ["phone on ground", "new people", "beauty retouching", "dramatic sunset"],
  "feasibility_confidence": "high"
}
```

## Render prompt mẫu

```text
PURPOSE
Create a photorealistic smartphone retake reference that a real user can reproduce at this same beach.

PRIMARY CHANGE
Turn the current seated wide portrait into a three-quarter seated portrait where the face and torso are the clear visual focus.

CAMERA ACTION
Use 2x zoom. Step back until the frame runs from mid-thigh to just above the head. Hold the phone around the subject's waist height and keep it nearly level, not looking down.

FRAME
Place the subject on the left third with open ocean on the gaze side. Keep the horizon level behind the shoulder. Remove distracting edge clutter.

SUBJECT ACTION
Remain seated, settle weight onto the rear hip, relax the shoulders, rest one hand naturally on the sand, turn the head toward the ocean, and look just past the camera.

CAPTURE MOMENT
Capture when a light breeze lifts a few strands of hair without covering the eyes.

PRESERVE
Preserve the same identity, hair, plaid top, white trousers, accessories, beach, weather, and warm natural side light.

AVOID
No phone on the ground, extra people, changed outfit, dramatic sunset, glam retouching, or stylized editorial treatment.
```

Prompt này ngắn hơn nhưng giữ đầy đủ các thành phần OpenAI coi là quan trọng: framing, viewpoint, placement, pose/action, gaze, interaction và invariants. Google và Adobe cũng khuyến nghị cấu trúc rõ theo subject, context, action, camera và light. [Google Imagen guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/img-gen-prompt-guide), [Adobe prompt guide](https://helpx.adobe.com/firefly/web/work-with-images/generate-images/writing-effective-text-prompts.html).

## Rubric QC đề xuất

| Tiêu chí | Trọng số |
|---|---:|
| Người dùng có thể chụp lại ngoài đời | 25 |
| Output bám capture plan | 25 |
| Giữ identity/outfit/location/light | 20 |
| Cải thiện visual hierarchy và pose | 20 |
| Anatomy và artifact | 10 |

Hard reject nếu:

- đổi location hoặc character của ánh sáng;
- identity drift rõ rệt;
- pose/contact vật lý không thể thực hiện;
- crop hoặc camera viewpoint trái primary change;
- tổng điểm dưới 85/100 hoặc capture-plan adherence dưới 20/25.

Nếu cần retry, chỉ gửi mismatch lớn nhất, ví dụ:

```text
Keep everything else unchanged. Correct only the framing: pull back to show the subject continuously from mid-thigh to head; do not return another close portrait.
```

## Thứ tự triển khai khuyến nghị

1. Bỏ việc để model tự viết `generation_prompt` và `safe_render_prompt`; chuyển sang deterministic composer.
2. Thêm `primary_change`, `scene_affordances` và `feasibility_confidence`.
3. Đổi camera geometry sang relative actions + visible framing targets.
4. Thêm visual QC và một targeted retry.
5. A/B test prompt V7.2 với prompt mới trên 20–30 bad cases, chấm blind theo rubric trên.
6. Sau khi chất lượng ổn định, thử `quality=low` cho reference preview nhằm giảm latency; OpenAI khuyến nghị đánh giá low cho workload nhạy latency, nhưng identity-sensitive portrait vẫn cần so sánh trực tiếp với medium trước khi đổi mặc định.

## Giới hạn cần ghi rõ trong sản phẩm

Một ảnh camera 2D không cho biết đầy đủ không gian đi lại, phần kiến trúc bị che hoặc khoảng cách thật. Vì vậy ảnh reference là một phương án chụp lại hợp lý, không phải mô phỏng hình học chính xác của camera tại địa điểm.

## Trạng thái triển khai

Đã implement trong backend ngày 04/09/2026:

- analysis trả thêm `capture_plan` nhưng vẫn giữ các field cũ để mobile tương thích ngược;
- backend tự dựng `generation_prompt`, `safe_render_prompt` và `text2image_prompt` từ capture plan;
- normalize các biến thể zoom như `2x smartphone telephoto` về enum `2x`;
- render output được chấm bằng rubric 100 điểm ở trên;
- reference chỉ pass khi tổng điểm đạt threshold và `capture_plan_adherence >= 20/25`;
- khi fail, flow sửa đúng một mismatch lớn nhất và chỉ retry một lần;
- API trả thêm `visualQcInitial`, `visualQcFinal`, `visualQcRetryCount`, `visualQcError`, `renderMode` và `fallbackReason` để theo dõi production;
- visual QC là fail-open: lỗi judge không làm mất reference image đã render.

Các biến môi trường vận hành:

```text
OPENAI_COACH_VISUAL_QC_ENABLED=false
OPENAI_COACH_VISUAL_QC_MODEL=gpt-5.6-luna
OPENAI_COACH_VISUAL_QC_THRESHOLD=85
OPENAI_COACH_VISUAL_QC_MAX_RETRIES=1
```

## Live QC synthetic

Test end-to-end ngày 04/09/2026 với một bad-example synthetic: camera quá cao, chủ thể nhỏ, foreground cát thừa và pose đứng cứng.

- analysis chọn `full_body_movement_portrait`, `2x`, hạ máy ngang hông và đi song song bờ biển;
- ba user tip: `Use 2x and move closer`, `Lower camera to hip height`, `Shoot as she takes a step`;
- render đầu đạt 82/100 nhưng fail vì adherence chỉ 16/25: hướng đi vẫn lao về camera và subject còn giữa frame;
- targeted retry sửa đúng mismatch này;
- output cuối đạt 89/100, adherence 22/25 và pass;
- residual issue do judge ghi nhận: vẫn còn nhiều foreground hơn target;
- latency tại máy test: analysis 22.2 giây, toàn bộ render + judge + retry 102.7 giây.

Kết quả cho thấy retry hoạt động đúng, nhưng latency khi retry quá cao cho UX live-camera. Vì vậy visual QC mặc định tắt; script `qc-coach-single.ts` tự bật khi biến env chưa được đặt. Khuyến nghị rollout theo feature flag, log score trước; chỉ bật retry đồng bộ cho nhóm thử nghiệm hoặc chuyển retry thành cập nhật reference bất đồng bộ.

## QC batch 10 bad examples

Bộ fixture synthetic gồm: plaza có subject quá nhỏ, cafe crop sai khớp, cầu thang lệch symmetry, tree merger, night backlight, indoor mixed light, horizon xuyên cổ, mural thiếu separation, forest leading-lines sai và foreground obstruction.

Kết quả production calibration:

- analysis và render thành công 10/10, không có schema failure;
- average analysis latency 24.8 giây;
- average render + initial judge latency 52.4 giây;
- rule cũ `70 total / 18 adherence` pass 10/10 nhưng bỏ lọt mismatch rõ;
- rule thử nghiệm `22/25 adherence` chỉ pass 3/10 và tạo quá nhiều retry không hiệu quả;
- rule được chọn: `85 total / 20 adherence`;
- với rule được chọn: initial pass 9/10, một retry cho mural tăng `83/18` lên `88/20`, final pass 10/10.

Các residual mismatch trên ảnh đã pass vẫn được lưu để offline tuning, nhưng không chặn delivery. Visual QC tiếp tục mặc định tắt cho đến khi có cơ chế async hoặc latency budget phù hợp.

## QC batch 5 ảnh du lịch

Pack bổ sung bao phủ landmark bị subject che, mountain overlook ngược sáng, old-town alley ultra-wide, temple symmetry và market crowd/clutter.

- analysis và render thành công 5/5, không có schema hoặc visual-QC error;
- initial pass 2/5, final pass 3/5 sau 3 retry;
- điểm trung bình tăng từ 87 lên 91;
- average analysis latency 20.9 giây;
- average render/QC latency 86.8 giây do 3 case cần retry;
- mountain case fail vì output đổi hazy backlight thành ánh sáng ấm, có directional shadow;
- market case tăng 76 lên 86 nhưng vẫn fail adherence 18/25 vì không đạt crop mid-thigh;
- cả 5 plan đều chọn 2x, kể cả landmark case được thiết kế để kiểm tra 1x, xác nhận cần audit zoom-selection bias.

Ưu tiên tuning tiếp theo: tăng ràng buộc giữ lighting character, buộc analysis so sánh 1x với 2x khi landmark đang bị crop, và đánh giá cách render crop thay vì tiếp tục thêm retry.
