# 历史暗盒实拍素材

1.10.0 起，平视胶片浏览改用随软件保存的生成素材及动态胶片层。本文保留 1.9.1 的网络实拍来源供追溯，当前浏览不再请求这些图片。新方案见 [生成素材及提示词](../public/assets/film-reel/GENERATION.md)。

胶片浏览使用真实暗盒照片，按胶卷型号及画幅精确匹配。没有对应照片时，135 使用无品牌黑色空暗盒，120 使用空卷轴。照片加载失败时回退通用素材，仍不可用时提供重新载入按钮。

目前有 14 款型号的 135 暗盒照片：Lucky C200、Kodak Gold 200、UltraMax 400、Portra 160 / 400 / 800、Fujicolor C200、Ilford HP5 Plus、FP4 Plus、Delta 400 / 3200、XP2 Super、Kentmere 100 / 400。另有 Portra 400 的 120 胶卷照片和两张通用素材，共 17 张参考照片。包装和印字可能随地区与批次变化。

| 用途 | 来源 |
| --- | --- |
| 型号暗盒实拍 | [Pola STORE 胶卷目录](https://pola-store.ru/3-fotoplenka)、各型号原始商品页 |
| Portra 400 / 120 | [LX Film Store](https://lxfilmstore.com/products/kodak-portra-400-120) |
| 通用 135 黑色空暗盒 | [Film labák / AP](https://www.filmlabak.sk/ap-plastova-kazeta-otvaratelna-pre-filmovu-metraz) |
| 通用 120 空卷轴 | [eBay 商品实拍](https://www.ebay.com/itm/296949178501) |

每张照片的具体来源链接都在界面暗盒下方，并登记于 `public/canister-photos.mjs`。这些产品参考照片的版权归原权利人所有，未作为可再分发素材打包到仓库。

应用只从固定素材清单获取图片，缓存于本机 `data/canister-images/`，与包装图缓存分开。缓存下载会缩放和转换 JPEG；显示时用 CSS 调整留白和白底混合，保留实拍标签，不绘制或覆盖虚构型号。原照片未进行生成式改写。
