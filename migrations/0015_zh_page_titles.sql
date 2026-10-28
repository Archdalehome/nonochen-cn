-- =============================================================================
--  Chen Furniture (内销中文站) - 8 个内容页的「标题」中文化
--  --------------------------------------------------------------------------
--  页面的标题和正文存在 `sections.data` 里，是 0002_seed.sql 带进来的英文种子
--  数据，不在界面翻译的范围里。这里**只改标题**：
--
--    关于我们 / 联系我们 / 常见问题 / 服务条款 /
--    隐私政策 / 配送说明 / 退换货 / 门店位置
--
--  **正文（data.body）一个字都不动。** 服务条款、隐私政策、配送说明、退换货这
--  四页写的是英国配送与退换期限，改写成中文等于替业主签了一版条款；正文由业主
--  用 /admin/pages 自己写。
--
--  写法说明：新标题写进 `data.heading`（页面编辑器读它当页面标题），并把旧的
--  `data.title`（种子里存的就是页面标题）删掉，免得第一个正文块把自己的标题再
--  渲染一遍。只匹配英文原值，所以跑过一次之后再跑就不会命中，幂等。
-- =============================================================================

UPDATE sections
   SET data = json_set(json_remove(data, '$.title'), '$.heading', '关于我们')
 WHERE page = 'page:about' AND type = 'page' AND json_extract(data, '$.title') = 'About Chen Furniture';

UPDATE sections
   SET data = json_set(json_remove(data, '$.title'), '$.heading', '联系我们')
 WHERE page = 'page:contact-details' AND type = 'page' AND json_extract(data, '$.title') = 'Contact Details';

UPDATE sections
   SET data = json_set(json_remove(data, '$.title'), '$.heading', '常见问题')
 WHERE page = 'page:faq' AND type = 'page' AND json_extract(data, '$.title') = 'FAQ';

UPDATE sections
   SET data = json_set(json_remove(data, '$.title'), '$.heading', '服务条款')
 WHERE page = 'page:terms-and-conditions' AND type = 'page' AND json_extract(data, '$.title') = 'Terms & Conditions';

UPDATE sections
   SET data = json_set(json_remove(data, '$.title'), '$.heading', '隐私政策')
 WHERE page = 'page:privacy' AND type = 'page' AND json_extract(data, '$.title') = 'Privacy Policy';

UPDATE sections
   SET data = json_set(json_remove(data, '$.title'), '$.heading', '配送说明')
 WHERE page = 'page:delivery' AND type = 'page' AND json_extract(data, '$.title') = 'Delivery Details';

UPDATE sections
   SET data = json_set(json_remove(data, '$.title'), '$.heading', '退换货')
 WHERE page = 'page:returns' AND type = 'page' AND json_extract(data, '$.title') = 'Returns';

UPDATE sections
   SET data = json_set(json_remove(data, '$.title'), '$.heading', '门店位置')
 WHERE page = 'page:store-locator' AND type = 'page' AND json_extract(data, '$.title') = 'Store Locator';
