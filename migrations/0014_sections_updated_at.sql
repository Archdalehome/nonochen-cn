-- =============================================================================
--  Chen Furniture - 「最后修改时间」
--  --------------------------------------------------------------------------
--  `sections` never recorded when a block was written, so the new /admin/pages
--  screen could not show it. The column is added here; rows that predate this
--  migration keep '' (the screen shows 「未记录」 for those).
--
--  Like 0003, this is a one-shot ALTER: it relies on Wrangler's migration
--  tracking, not on being safe to run twice.
-- =============================================================================

ALTER TABLE sections ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
