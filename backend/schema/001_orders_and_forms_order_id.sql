-- Orders table: one row per "zakázka" (order), stores customer data
-- Run this script to add orders and link forms to orders.
-- No data migration: existing forms keep order_id NULL.

-- Sequence for orders
CREATE SEQUENCE IF NOT EXISTS orders_id_seq;

CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" int4 NOT NULL DEFAULT nextval('orders_id_seq'::regclass),
    "user_id" varchar NOT NULL CHECK ((user_id)::text <> ''::text),
    "name" varchar,
    "email" varchar,
    "phone" varchar,
    "address" varchar,
    "city" varchar,
    "zipcode" varchar,
    "raynet_id" int4,
    "erp_customer_id" int4,
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" timestamp,
    PRIMARY KEY ("id")
);

COMMENT ON TABLE "public"."orders" IS 'Orders (zakázky) - each row is one customer/order';
COMMENT ON COLUMN "public"."orders"."user_id" IS 'User identifier (email) from authentication system';
COMMENT ON COLUMN "public"."orders"."deleted_at" IS 'Soft delete - NULL means not deleted';

-- Reuse existing update_updated_at trigger (same as forms)
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON "public"."orders"
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();

-- Add order_id to forms (nullable: existing forms have no order)
ALTER TABLE "public"."forms"
    ADD COLUMN IF NOT EXISTS "order_id" int4 REFERENCES "public"."orders"("id");

COMMENT ON COLUMN "public"."forms"."order_id" IS 'Optional FK to orders - when set, customer data comes from order';

CREATE INDEX IF NOT EXISTS idx_forms_order_id ON "public"."forms" ("order_id");
