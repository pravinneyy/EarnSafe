# In-memory stores retained for prototype policy and claim flows.
# User data now lives in Supabase.

policies_db: list[dict] = []
claims_db: list[dict] = []
payment_quotes_db: list[dict] = []
payment_orders_db: list[dict] = []
