# 平视暗盒素材与生成说明

2026-10-25，通过内置 `imagegen` 生成，按用户确认的正面平视方案制作。PNG 保留原始透明 alpha，未将照片帧烘焙进素材，也未使用生成式工具改写用户的扫描照片。

| 文件 | 用途 |
| --- | --- |
| `lucky-c200.png` | 乐凯 C200 专属平视暗盒 |
| `label-template.png` | 同结构的空白标签暗盒，供其他已知型号共用 |
| `default.png` | 同结构、无标识的黑色默认暗盒 |
| `spool-120.png` | 独立的 120 卷轴及空白背纸 |

这些图片是界面视觉素材，并非产品实拍照片。乐凯图案依照确认的效果图生成；其他型号采用界面示意标签和配色，不冒充官方包装。

## 生成提示词

### 乐凯专属暗盒

Reference: the approved front-elevation Lucky C200 concept. Generate only one isolated Lucky C200 135 cassette as a physically based 3D render on genuine transparent alpha. No UI, film strip, ground, background, surrounding scene, annotations or cast shadow outside the object. Portrait canvas, entire cassette visible with transparent padding. Straight-on orthographic eye-level front elevation, upright vertical spool axis, no tilt or looking down into the spool. Match the approved cylinder, enamel black caps and rims, short top spindle, red and white diagonal label, green 200, and text 乐凯 / LUCKY / 彩色胶卷 / COLOR FILM / C-41. Subtle realistic highlights and print texture. Show a narrow integrated felt-lined vertical mouth at the extreme right tangent of the barrel. The mouth spans about 80% of total cassette height, leaving cap margins, with crisp upper and lower endpoints for aligning a 35mm strip. No protruding film. Overall height about twice overall width; a short cylinder rather than a tall bottle. Soft upper-left studio light, neutral fill, detailed shadows, transparent pixels outside the silhouette. No painted checkerboard.

### 可换标签的共用暗盒

Precise edit of the Lucky cassette asset. Preserve the identical canvas, silhouette, placement, spool, caps, felt-lined mouth endpoints and camera. Change only the coloured label to completely blank light ivory paper wrapped around the same barrel. Remove all brand names, logos, Chinese letters, numbers and stripes. Keep subtle paper texture and darkened curved left/right edges with a brighter centre. No extra features or protruding film. Preserve transparent alpha. Same geometry, lighting, padding and proportions.

### 黑色默认暗盒

Precise edit of the blank-label cassette. Preserve the exact silhouette, canvas, placement, orthographic camera, cap positions, spindle and right-hand mouth endpoints. Change only the ivory sleeve to plain matte near-black charcoal, completely unbranded: no paper label, lettering, numbers, logos or coloured stripes. Retain realistic enamel rim highlights and fine material texture. No protruding film, ground or background. Preserve genuine alpha; no camera or geometry changes.

### 120 卷轴

Use the blank-label reference only for front camera, alignment, lighting and material style. Generate one upright 120 medium-format spool wrapped with clean unprinted ivory backing paper on genuine transparent alpha. It is not a 135 metal cassette: no closed casing or felt housing. Narrow black plastic spool, flat flanges at top/bottom, full rolled paper cylinder between them, fine paper grain, subtle right tangent edge where backing paper unwinds. No protruding strip, print, brand or numbers. Total height about 2.6 times diameter; usable roll height about 61/67 of total height. Perfectly straight-on orthographic elevation, no tilt, no looking down or perspective narrowing. Entire roll visible with transparent padding, soft upper-left light, no outside glow, ground, scene or UI.

## 出片与缩放

`public/film-reel.mjs` 登记原图尺寸和出片口坐标。界面使用同一个比例把暗盒和胶片放进灯箱，保证胶片上、下边缘分别对应出片口两端。135 片宽按 35mm，画面窗口按 36×24mm，帧距按 38mm，齿孔按每帧八孔绘制；透明齿孔由原生 SVG mask 实现。

暗盒保持固定，连续胶片向右位移时，新帧从口内出现，卷头位于外端；回卷反向收回。滑杆、滚轮、逐帧、自动播放与拖动共用同一展开进度。尺寸变化后按展开进度重建滚动位置。

120 使用 61mm 片宽和独立卷轴素材，无齿孔。由于档案尚未记录中画幅相机的具体画幅，预览窗口采用 6×6 示意，原扫描完整等比显示，不裁切。其他规格使用通用视觉示意。

旧版网络实拍来源和缓存说明保留于 `docs/canister-photos.md` 供追溯；当前平视浏览不再依赖网络实拍素材。
