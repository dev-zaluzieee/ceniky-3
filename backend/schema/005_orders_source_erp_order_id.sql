-- Add source_erp_order_id to orders table.
-- Links a local order to its corresponding ERP order for export purposes.
-- No FK constraint (ERP is a separate database).
ALTER TABLE orders ADD COLUMN source_erp_order_id INT NULL;
