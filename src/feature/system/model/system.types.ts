export type SystemSettings = {
  allowOutOfStockSales: boolean;
};

export function buildDefaultSystemSettings(): SystemSettings {
  return {
    allowOutOfStockSales: true,
  };
}
