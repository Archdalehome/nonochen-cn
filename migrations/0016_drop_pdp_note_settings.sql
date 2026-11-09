-- =============================================================================
--  Chen Furniture (内销中文站) - 清掉商品页旧的「配送与退换」配置项
--  --------------------------------------------------------------------------
--  商品页这一块以前读 settings.pdp_delivery_copy（不填时用一句写死的英文），
--  另外还有 pdp_shipping_note / pdp_returns_note 两条图标提示。现在这三点全部
--  改成实时读 /pages/delivery 与 /pages/returns 的内容，代码里不再读这三个 key。
--
--  这几行留在库里只会让人以为改它们还有效，删掉。删除是幂等的：重复执行没有副作用。
--  正文本身（sections 里 page:delivery / page:returns 的行）一个字都不动。
-- =============================================================================

DELETE FROM settings
 WHERE key IN ('pdp_delivery_copy', 'pdp_shipping_note', 'pdp_returns_note');
