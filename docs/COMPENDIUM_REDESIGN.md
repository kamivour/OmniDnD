# Kế hoạch nâng cấp Compendium

Bản nâng cấp sau M45, ngày 2026-11-22. Mục tiêu là nhìn hình nhận ra loại mục, đọc được chỉ số chính ngay khi mở mục và lọc nhanh trên cả điện thoại lẫn desktop.

## Trước khi nâng cấp

- **Trident of Fish Command** được import với loại `magic`, Uncommon, attunement và 3 charges. Mục Trident thường đã có sát thương, tầm ném và thuộc tính. Compendium chỉ đọc `weapon` và `armor` nằm trực tiếp trên mục đang mở, còn bản phép thiếu liên kết tới Trident. [Dữ liệu bản phép](../data/srd/magic-items.json) · [Dữ liệu vũ khí gốc](../data/srd/items.json) · [Cách hiển thị hiện tại](../src/ui/compendium/compendium-facts.ts)
- Rà các pack hiện tại thấy **541 mục Equipment và 72 feat**. Chỉ 4 mục Equipment có glyph riêng trong bộ icon hiện tại và chưa có glyph riêng cho feat. Danh sách kết quả hiện chỉ có chữ, còn trang chi tiết dùng diamond khi tra icon thất bại. [Danh sách](../src/ui/screens/CompendiumScreen.tsx) · [Icon](../src/ui/components/Icon.tsx)
- Có **33 magic item mang đầu mục “Weapon”** và **27 mang đầu mục “Armor”** chưa có bộ chỉ số tương ứng trong dữ liệu được import. Nhóm Weapon gồm cả đạn và công thức dành cho nhiều loại vũ khí. Cần phân biệt các trường hợp này trước khi chọn chỉ số hiển thị. [Bộ import](../scripts/srd/map.ts) · [Bộ phân loại](../src/engine/catalog.ts)
- Mọi nút Tier dùng cùng một màu accent khi được chọn. Chỉ số được gom vào một khối chung, nên thông tin quan trọng của từng tab có thứ bậc thị giác giống nhau. [Màn hình](../src/ui/screens/CompendiumScreen.tsx) · [Chi tiết](../src/ui/compendium/CompendiumDetail.tsx)

## Trải nghiệm dự kiến

### Bố cục và tìm kiếm

- Giữ bảy tab **Spells, Classes, Subclasses, Races, Backgrounds, Feats, Equipment**. Dùng chung một hệ thẻ kết quả với icon, tên, tối đa hai dữ kiện dễ quét và nguồn sách. Nội dung từng tab quyết định dữ kiện nào lên thẻ.
- Desktop dùng danh sách và trang đọc cạnh nhau khi vùng nội dung đủ rộng, tính cả diện tích sidebar nhân vật đang chiếm. Điện thoại mở một sheet cao, có một luồng cuộn, một tiêu đề và nút đóng dễ chạm. Khi đóng, người dùng quay lại đúng mục và vị trí danh sách.
- Đặt ô tìm cạnh nút **Filters** và số kết quả. Equipment có hàng Tier chính ngay dưới ô tìm. Type và Books nằm trong nhóm lọc có thể mở, với các bộ lọc đang áp dụng hiển thị bên ngoài. Chọn cùng nhóm theo kiểu “hoặc”, kết hợp giữa các nhóm theo kiểu “và”. Giữ `Clear filters` và lối thoát khi danh sách rỗng.
- Với Equipment, ô tìm nhận tên món và tên vũ khí/giáp gốc đã xác minh. Ví dụ tìm “warhammer” thấy cả Warhammer và Dwarven Thrower khi bộ lọc cho phép. Tìm kiếm các tab khác giữ theo tên. Giữ phân trang hiện tại và đo hiệu năng trước khi đổi cách render.
- Giữ link trực tiếp, reload, Back và các tham số `kind`, `entry`, `q`, `tier`, `type`, `books` đang dùng. Trong trang nhân vật, mặc định theo sách của campaign. Link từ Journal Plans vẫn mở đúng mục với **Show all books**. **Plan this** tiếp tục là ghi chú có Undo trong Journal. [Hành vi hiện hành](PLAN.md#m45--compendium)

Sơ đồ dưới đây thể hiện thứ tự đọc. Trên điện thoại, phần chi tiết chiếm chiều ngang của sheet và các chỉ số tự xuống dòng.

```text
Compendium                        Spells … Feats  Equipment
Search equipment                  Filters     Clear filters
Mundane · Common · Uncommon ✓ · Rare · Very rare · Legendary · Artifact

Uncommon                        │ Trident of Fish Command
[trident] Trident of Fish Command│ Uncommon · Martial melee · DMG
          1d6 Piercing      DMG  │ Attunement required
[javelin] Javelin of Lightning  │ Damage 1d6 / 1d8   Damage Type Piercing
                           DMG  │ Range 20 / 60 ft  Thrown   Versatile
                                │ Magic effect · Charges
```

### Nội dung từng tab

| Tab | Dữ kiện thấy đầu tiên | Chi tiết ưu tiên |
|---|---|---|
| Equipment | Hình hoặc silhouette, loại đồ, rarity và một chỉ số chính nếu có | Hồ sơ vũ khí/giáp, thông tin attunement và charges, hiệu ứng, nguồn |
| Feats | Icon theo hiệu ứng, tên, prerequisite ngắn nếu có | Prerequisite, lợi ích, lựa chọn hoặc tăng chỉ số theo dữ liệu, nguồn |
| Spells | Icon theo school, level, school và dấu hiệu ritual/concentration khi có | Casting time, range, duration, components, class, save/attack và upcast nếu có |
| Classes | Biểu tượng class, hit die và cấp chọn subclass | Saving throws, spellcasting, features theo cấp và link subclass |
| Subclasses | Biểu tượng nhận diện, class, cấp bắt đầu khi có dữ liệu | Features theo cấp, spell được cấp và spell chỉ được thêm vào danh sách lựa chọn |
| Races | Biểu tượng race, size và speed | Trait, ability/language theo đúng bản 2014, darkvision, link race/subrace |
| Backgrounds | Icon nghề hoặc vai trò, các skill chính | Skill, tool, language, feature và nguồn |

### Equipment và Trident of Fish Command

Trang chi tiết mở bằng tên, hình, loại đồ, rarity và nguồn. Đặt **Attunement** và điều kiện attune đã xác minh gần tiêu đề. Khối chỉ số đặt ngay dưới. Hiệu ứng phép và nội dung SRD nằm phía sau, dưới các tiêu đề dễ quét.

| Trident of Fish Command | Giá trị cần thấy trên giao diện |
|---|---|
| Type | Martial melee weapon · Trident |
| Tier | Uncommon |
| Damage | 1d6 · 1d8 two-handed |
| Damage Type | Piercing |
| Properties | Range · Thrown · Versatile |
| Range | 20 / 60 ft |
| Magic effect | Attunement, 3 charges, hồi 1d3 lúc bình minh. Khi đọc chi tiết hiệu ứng, thấy điều kiện mục tiêu và DC của Dominate Beast |

Các giá trị vũ khí ở trên lấy từ bảng Trident 2014. Giữ **Range** làm nhãn giải thích đi kèm tầm ném, còn dữ liệu `weapon.properties` vẫn lưu Thrown và Versatile theo cấu trúc hiện có. Giá mua Trident thường không phải giá món phép, nên chỉ hiện giá của bản phép nếu có nguồn riêng. [Bảng Equipment 2014](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/equipment#Weapons) · [Magic items 2014](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/magic-items)

- Chỉ số quan trọng có nhãn và giá trị luôn đọc được. Chip thuộc tính mở giải thích bằng hover hoặc focus trên desktop và bằng tap trên điện thoại. Viết tóm tắt 2014 ngắn bằng lời của mình. Range phân biệt tầm thường và tầm xa, Thrown giải thích cách dùng chỉ số khi ném, Versatile nêu xúc xắc dùng khi cầm hai tay.
- Giáp ưu tiên AC hoặc công thức AC, giới hạn DEX, yêu cầu STR, bất lợi Stealth và loại giáp. Shield hiện phần AC cộng thêm. Mũ, bốt và găng có hiệu ứng riêng vẫn giữ đúng loại item của sách.
- Với món có một vũ khí/giáp gốc, hiển thị bộ chỉ số đã xác minh. Với “any sword”, “any weapon” hoặc nhiều bộ giáp, hiển thị nhóm được phép. Nếu có danh sách lựa chọn xác minh được, cho xem từng loại gốc trong chi tiết, giữ lựa chọn trong phiên xem. Ví dụ Flame Tongue cho xem Longsword hoặc Shortsword tương ứng. Các món không có bộ chỉ số riêng, như đạn, chỉ hiện thông tin áp dụng cho chính món đó.

### Màu rarity

| Tier | Màu đề xuất |
|---|---|
| Mundane | Xám |
| Common | Trắng ngà, dùng viền đậm trên nền sáng |
| Uncommon | Xanh lá |
| Rare | Xanh dương |
| Very rare | Tím |
| Legendary | Vàng kim |
| Artifact | Đỏ |
| Varies, khi có dữ liệu | Trung tính, kèm nhãn Varies |

Mỗi tier dùng cùng sắc cho chip lọc, tiêu đề nhóm và nhãn rarity trong trang chi tiết. Màu xuất hiện cả khi chip chưa được chọn. Chip đang chọn có viền rõ và dấu chọn, đồng thời giữ `aria-pressed`. Chữ giữ tương phản với nền Dark và Parchment, mục tiêu tối thiểu 4.5:1 cho chữ cỡ thường ở các trạng thái. Màu xanh lá bổ sung một bậc để phân biệt đủ bảy tier. [W3C về tương phản chữ](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

### Hình Equipment và icon Feats

1. Ưu tiên ảnh đúng món có quyền tái sử dụng và phân phối trong repo public. Với mỗi ảnh, lưu ID món, nguồn, tác giả, giấy phép và ghi công. D&D Beyond là nguồn đối chiếu quy tắc và hình tham khảo. Chỉ dùng asset từ đó nếu xác minh được quyền cho chính asset đó. [Điều khoản D&D Beyond](https://www.dndbeyond.com/terms-conditions/) · [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
2. Nếu thiếu ảnh riêng, dùng silhouette của vật gốc. Trident of Fish Command có hình đinh ba, Longsword có hình kiếm, Longbow có hình cung, các kiếm phép dùng cùng silhouette nếu cùng kiểu. Trident của Lorc là ứng viên có giấy phép rõ để làm mẫu. [Trident của Lorc](https://game-icons.net/1x1/lorc/trident.html)
3. Khi chỉ biết họ item, dùng icon phù hợp, như kiếm cho melee, cung cho ranged, khiên cho shield, áo giáp cho body armor, mũ/bốt/găng đúng món đeo. Potion, scroll, wand, staff, ring, tools và container có hình riêng. Với wondrous item, ưu tiên hình vật thể như áo choàng, túi, dây chuyền hoặc gương.
4. Feat lấy icon theo hiệu ứng dễ nhận ra. **Sharpshooter** dùng tâm ngắm, **Sentinel** dùng khiên/điểm chặn, **War Caster** dùng hình thi triển phép, **Mobile** dùng bốt, **Actor** dùng mặt nạ, **Alert** dùng mắt. Mục không có hình riêng dùng icon theo nhóm hoặc huy hiệu feat. Toàn bộ Equipment và Feats có hình có nghĩa hoặc fallback phù hợp, bỏ diamond khỏi hai tab ở cả danh sách và chi tiết.
5. Dùng lại bộ icon nội bộ và Credits hiện có. Ảnh lưu nội bộ, tải thumbnail khi cần, giữ kích thước để tránh nhảy bố cục. Khi lỗi tải hoặc offline, silhouette nội bộ vẫn hiện. Icon cạnh tên là trang trí với trình đọc màn hình. [Bộ icon và điều kiện ghi công](https://github.com/game-icons/icons/blob/master/license.txt) · [Script icon của repo](../scripts/fetch-icons.ts)

Bản triển khai dùng 15 ảnh Ardentryst có giấy phép CC BY 3.0, tổng khoảng 150 KiB. Bộ silhouette cục bộ phủ các món và feat còn lại, gồm Trident of Fish Command. [Ảnh và giấy phép](https://opengameart.org/node/11858)

## Dữ liệu và giới hạn triển khai

- Đọc chỉ số có sẵn trên item trước, rồi lấy chỉ số từ một base item được xác minh nếu món áp dụng đúng một loại. Ghi metadata Compendium cho các quan hệ chưa có bằng ID ổn định, tách khỏi overlay thay đổi cơ chế chơi. Những chỗ khác luật gốc, như sát thương bổ sung của món phép hay điều kiện kích hoạt, được ghi riêng và đối chiếu nguồn.
- Kiểm tra từng mục của nhóm 33 vũ khí/đạn và 27 giáp phép. Ghi lại nhóm **base cố định**, **nhiều base**, **đạn**, hoặc **ngoại lệ cần mô tả riêng**. Dữ liệu render dùng metadata đã xác minh. Trình kiểm tra có thể dùng tiêu đề SRD để tìm mục cần rà. Quyết định chỉ số và ảnh dùng ID cùng quan hệ được duyệt.
- Giữ import SRD 5.1 có thể chạy lại từ nguồn đã ghim. Với nguồn ngoài SRD, dùng metadata và tóm tắt tự viết. Dùng bản 2014 ở mọi bảng và tooltip, gồm cả những tên trùng với bản mới.
- Giữ IDs, schema save, dữ liệu sync và chỉ số Inventory, Sheet, Combat như hiện hành. Nếu phát hiện lỗi cơ chế cần sửa, ghi lại riêng với nguồn và test. Compendium sử dụng cùng routes và Find entry hiện tại. Bất kỳ section điều hướng mới nào cũng có Find entry theo AGENTS.
- Các token màu giao diện theo theme hiện tại. Nếu thêm định dạng ảnh mới, kiểm tra cấu hình PWA, kích thước cache và fallback khi ảnh chưa được cache. So sánh build và mở Equipment trước/sau trên phone. Đặt ngân sách ảnh sau khi đo mẫu, với silhouette nội bộ làm phương án mặc định cho toàn catalog.

## Trình tự triển khai và nghiệm thu

| Đợt | Đầu ra | Điều kiện hoàn thành |
|---|---|---|
| 1. Mẫu để duyệt | Mẫu desktop và điện thoại cho Trident of Fish Command, một món giáp, một feat và hàng tier. Chọn kiểu hình, cỡ thẻ và khoảng cách | Người dùng thấy được đúng dữ kiện, hiểu màu tier và nhận ra món bằng silhouette ở cỡ nhỏ |
| 2. Equipment và rarity | Resolver read-only, dữ liệu liên kết kiểm tra được, chỉ số rõ, giải thích property và token tier | Trident có thông số trong bảng trên. Longbow, Blowgun, Net, +1 weapon, Animated Shield và món nhiều base giữ đúng đặc điểm. Bộ lọc và chi tiết dùng cùng tier |
| 3. Hình Equipment và Feats | Phủ danh mục bằng asset hợp lệ và fallback có nghĩa, ghi nguồn và bổ sung nội dung feat | Tất cả 541 mục equipment và 72 feat hiện tại có cách chọn hình xác định. Asset lỗi hiện fallback phù hợp |
| 4. Giao diện cả Compendium | Áp dụng bố cục, filter, cấp bậc thông tin và điều hướng cho đủ bảy tab | Ở 375 px và 1440 px, danh sách gọn, detail dễ đọc, filter dễ tìm, thông tin chính nằm trước mô tả, Back vẫn về đúng kết quả |
| 5. Kiểm tra cuối | Unit tests, test trình duyệt, build PWA và checklist thủ công | Đạt các điều kiện dưới đây. Changelog ghi trải nghiệm user thấy, mỗi đợt có commit riêng sau kiểm tra |

### Kiểm tra tự động

- Unit test resolver với base cố định, nhiều base, dữ liệu thiếu, ID sai, nội dung ghi đè và phân loại đạn. Kiểm tra Trident 2014, Blowgun sát thương cố định, Net không gây damage, Longbow có hai tầm và Animated Shield cộng AC. Regression test xác nhận ID và tính năng Inventory/Combat của item cũ giữ nguyên.
- Quét toàn bộ Equipment và Feats để tìm fallback rỗng, asset thiếu và nguồn ghi công thiếu. Kiểm tra mapping đủ tier và thứ tự, tên các tier, filter nhiều lựa chọn, URL cũ và tìm theo base item.
- E2E ở 375 px và 1440 px cho Trident, một mẫu giáp, một feat và một mục mỗi tab còn lại. Kiểm tra mở chi tiết từ list và từ URL, tooltip bằng bàn phím và chạm, đóng/Back trả focus, filter giữ trạng thái, Show all books, Plan this và Undo. Kiểm tra chuỗi tìm không khớp và viewport desktop hẹp có sidebar.
- Mở Equipment và Feats offline sau khi PWA cài cache, kiểm tra art đúng khi có cache và fallback khi ảnh thiếu. Chạy `npm test`, `npm run typecheck`, `npm run lint`, build và suite Compendium/PWA liên quan.

### Duyệt trực quan

- Nhìn ở cỡ thumbnail, phân biệt được đinh ba, kiếm, cung, khiên, giáp, mũ, bốt, potion và scroll.
- Trident hiện sát thương, Damage Type, Properties, Range và Versatile ngay phần đầu, với chữ dễ đọc.
- Giải thích property rõ khi mở bằng chuột, bàn phím và chạm.
- Tier phân biệt được trong Dark, Parchment và một theme kính. Trạng thái được chọn vẫn rõ khi bỏ màu.
- So sánh một magic weapon có base cố định, một món có nhiều base và một món armor/shield. Hình và chỉ số khớp loại đang đọc.
- Feats khác nhóm nhìn khác nhau; prerequisite và lợi ích đủ dễ đọc trên điện thoại.
- Xem đủ bảy tab ở 375 px và 1440 px. Kiểm tra nội dung xuống dòng, khoảng trống, thứ tự và việc quay về danh sách.
- Cuộn catalog dài, mở vài mục liên tiếp và thử offline. Hình hiện ổn định và thao tác lọc vẫn phản hồi nhanh.
