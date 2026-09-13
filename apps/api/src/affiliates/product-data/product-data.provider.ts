export const PRODUCT_DATA_PROVIDER = "PRODUCT_DATA_PROVIDER";

export interface ProductData {
  title?: string;
  imageUrl?: string;
  price?: string;
  currency?: string;
}

export interface ProductDataFetchInput {
  url: string;
  asin?: string;
}

/**
 * Affiliate-01 adapter boundary for product data.
 *
 * Phase-00 reality: PA-API is NOT available (Amazon Associates account
 * `zorajewellery-21` requires 10 qualifying sales in the trailing 30 days; 0 today).
 * Product metadata is entered manually. Once the account qualifies, implement this
 * interface with a PA-API adapter and switch the `PRODUCT_DATA_PROVIDER` DI token —
 * no core changes needed.
 */
export interface ProductDataProvider {
  readonly name: string;
  fetch(input: ProductDataFetchInput): Promise<ProductData>;
}

export const MANUAL_PRODUCT_PROVIDER: ProductDataProvider = {
  name: "manual",
  async fetch(): Promise<ProductData> {
    return {};
  },
};