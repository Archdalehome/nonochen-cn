-- =============================================================================
--  Chen Furniture (内销中文站) - 界面文案中文化
--  --------------------------------------------------------------------------
--  代码层的界面文案（src/views、src/lib）已经中文化，但页头分类、页脚栏目、
--  购物车与商品页的按钮/表单提示这些字，实际来自 D1 里的 settings / menu_items，
--  代码里的中文只是「取不到时的兜底」。这个迁移把这些行改写成中文。
--
--  只改「结构性界面文案」：栏目名、按钮、表单提示、版权行。
--  **不动**任何价格、货币符号、运费与交期承诺、品牌话术——那些要业主终审：
--    announcement_text（免邮公告）、brand_line（品牌话术）、
--    cart_footer_note / pdp_trust_* / pdp_geo_note（免邮与质保承诺）、
--    ship_accordion_body / returns_note（配送与退换条款正文）。
--  这些行保持原样，等业主给口径后单独改。
--
--  幂等：全部是按 key / label 精确匹配的 UPDATE，重复执行结果一致。
--  按 label 改页脚时同时限定 location='footer'，不会碰到页头/移动端菜单。
-- =============================================================================

-- 1. 购物车与抽屉 -------------------------------------------------------------
UPDATE settings SET value = '购物车'       WHERE key = 'cart_title'          AND value = 'Your Cart';
UPDATE settings SET value = '购物车是空的' WHERE key = 'cart_empty_title'    AND value = 'Cart is empty';
UPDATE settings SET value = '继续选购'     WHERE key = 'cart_continue_label' AND value = 'Continue Shopping';
UPDATE settings SET value = '安全结账'     WHERE key = 'cart_checkout_label' AND value = 'Secure Checkout';

-- 2. 搜索与商品列表 -----------------------------------------------------------
UPDATE settings SET value = '搜索'     WHERE key = 'search_title'      AND value = 'Search';
UPDATE settings SET value = '全部商品' WHERE key = 'products_heading'  AND value = 'All products';

-- 3. 商品详情页的表单标题（只有标题与提示，不含任何承诺） ---------------------
UPDATE settings SET value = '选择颜色'            WHERE key = 'pdp_colour_heading' AND value = 'Select Colours.';
UPDATE settings SET value = '选你喜欢的颜色。'    WHERE key = 'pdp_colour_sub'     AND value = 'Pick your favourite.';
UPDATE settings SET value = '选择尺寸'            WHERE key = 'pdp_size_heading'   AND value = 'Size.';
UPDATE settings SET value = '为你的空间而选。'    WHERE key = 'pdp_size_sub'       AND value = 'Made for your space.';
UPDATE settings SET value = '商品|特点'           WHERE key = 'features_heading'   AND value = 'Product|Features';
UPDATE settings SET value = '配送与退换'          WHERE key = 'ship_accordion_title' AND value = 'Shipping & Returns';
UPDATE settings SET value = '查看配送说明'        WHERE key = 'ship_link_label'    AND value = 'View full information on shipping';
UPDATE settings SET value = '查看退换货说明'      WHERE key = 'returns_link_label' AND value = 'View full information on returns';

-- 4. 订阅区块（标题、说明、占位、按钮、退订说明，都是中性文案） ---------------
UPDATE settings SET value = '保持联系'                            WHERE key = 'newsletter_title'       AND value = 'Stay Connected';
UPDATE settings SET value = '订阅后，新品与更新会第一时间发到你邮箱。' WHERE key = 'newsletter_intro'       AND value = 'Join now for all news and updates.';
UPDATE settings SET value = '邮箱地址'                            WHERE key = 'newsletter_placeholder' AND value = 'Email address';
UPDATE settings SET value = '订阅'                                WHERE key = 'newsletter_button'      AND value = 'Join the club';
UPDATE settings SET value = '可随时退订  |  订阅即表示你同意我们的隐私政策' WHERE key = 'newsletter_note'   AND value = 'Unsubscribe anytime  |  By joining, you agree to our Privacy Policy';

-- 5. 版权行（年份与品牌名原样保留） ------------------------------------------
UPDATE settings
   SET value = '© ' || CAST(strftime('%Y', 'now') AS TEXT) || ' Chen Furniture｜保留所有权利'
 WHERE key = 'footer_copyright';

-- 6. 页脚栏目名与链接名 -------------------------------------------------------
--    先改栏目名，链接是按 parent_id 挂着的，改完不影响从属关系。
UPDATE menu_items SET label = '公司' WHERE location = 'footer' AND kind = 'group_heading' AND label = 'Company';
UPDATE menu_items SET label = '关注' WHERE location = 'footer' AND kind = 'group_heading' AND label = 'Follow';
UPDATE menu_items SET label = '帮助' WHERE location = 'footer' AND kind = 'group_heading' AND label = 'Help';

--    group_label 是链接行上的冗余列（/admin/footer 用它找回父栏目），一起改。
UPDATE menu_items SET group_label = '公司' WHERE location = 'footer' AND group_label = 'Company';
UPDATE menu_items SET group_label = '关注' WHERE location = 'footer' AND group_label = 'Follow';
UPDATE menu_items SET group_label = '帮助' WHERE location = 'footer' AND group_label = 'Help';

--    链接按 url 匹配（label 各库可能不同：Terms & Conditions / Privacy Policy /
--    Delivery Details 都是主题自带的写法），url 是这条链接的身份。
UPDATE menu_items SET label = '关于我们' WHERE location = 'footer' AND kind = 'link' AND url = '/pages/about';
UPDATE menu_items SET label = '联系我们' WHERE location = 'footer' AND kind = 'link' AND url = '/pages/contact-details';
UPDATE menu_items SET label = '常见问题' WHERE location = 'footer' AND kind = 'link' AND url = '/pages/faq';
UPDATE menu_items SET label = '服务条款' WHERE location = 'footer' AND kind = 'link' AND url = '/pages/terms-and-conditions';
UPDATE menu_items SET label = '隐私政策' WHERE location = 'footer' AND kind = 'link' AND url = '/pages/privacy';
UPDATE menu_items SET label = '配送说明' WHERE location = 'footer' AND kind = 'link' AND url = '/pages/delivery';
UPDATE menu_items SET label = '退换货'   WHERE location = 'footer' AND kind = 'link' AND url = '/pages/returns';
