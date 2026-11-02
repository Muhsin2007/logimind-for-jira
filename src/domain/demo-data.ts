import { addDays } from './dates';
import type { IsoDate } from './types';

/**
 * Synthetic demo dataset. Dates are offsets from `today` so the same scenarios
 * (late, slipping, missing ETA, low stock, healthy) appear whenever the demo is loaded.
 * All names are fictional.
 */
const PRODUCTS: Record<string, string> = {
  'SKU-01': 'Brake pads (front)',
  'SKU-02': 'Air filter',
  'SKU-03': 'Oil filter',
  'SKU-04': 'Spark plug set',
  'SKU-05': 'Timing belt',
  'SKU-06': 'Wiper blades',
  'SKU-07': 'Alternator',
  'SKU-08': 'Radiator hose',
  'SKU-09': 'Shock absorber',
  'SKU-10': 'Headlight bulb',
};

// [id, order, supplier, sku, qty, plannedOffset, etaOffset, actualOffset, status, warehouse, carrier]
type Row = [string, string, string, string, number, number, number | null, number | null, string, string, string];

const SHIPMENTS: Row[] = [
  ['SHP-1001', 'PO-501', 'NorthStar Parts', 'SKU-01', 120, 2, 6, null, 'in_transit', 'Tashkent', 'Caspian Freight'],
  ['SHP-1002', 'PO-502', 'EastLine Supply', 'SKU-02', 80, -1, null, null, 'in_transit', 'Tashkent', 'SilkWay Cargo'],
  ['SHP-1003', 'PO-503', 'MetroParts', 'SKU-03', 200, 8, 8, null, 'confirmed', 'Tashkent', 'Caspian Freight'],
  ['SHP-1004', 'PO-504', 'Altai Components', 'SKU-04', 150, -9, -9, null, 'customs', 'Samarkand', 'Steppe Line'],
  ['SHP-1005', 'PO-505', 'NorthStar Parts', 'SKU-05', 60, -4, 1, null, 'in_transit', 'Tashkent', 'Caspian Freight'],
  ['SHP-1006', 'PO-506', 'Silk Road Motors', 'SKU-06', 300, -12, -11, -11, 'delivered', 'Tashkent', 'SilkWay Cargo'],
  ['SHP-1007', 'PO-507', 'EastLine Supply', 'SKU-07', 25, 5, null, null, 'in_transit', 'Samarkand', 'Steppe Line'],
  ['SHP-1008', 'PO-508', 'MetroParts', 'SKU-08', 90, 3, 3, null, 'in_transit', 'Tashkent', 'Caspian Freight'],
  ['SHP-1009', 'PO-509', 'Altai Components', 'SKU-09', 40, -20, -18, -16, 'delivered', 'Samarkand', 'Steppe Line'],
  ['SHP-1010', 'PO-510', 'Silk Road Motors', 'SKU-10', 500, 1, 1, null, 'in_transit', 'Tashkent', 'SilkWay Cargo'],
  ['SHP-1011', 'PO-511', 'NorthStar Parts', 'SKU-01', 100, 14, 21, null, 'confirmed', 'Samarkand', 'Caspian Freight'],
  ['SHP-1012', 'PO-512', 'EastLine Supply', 'SKU-03', 180, -6, -6, -5, 'delivered', 'Tashkent', 'SilkWay Cargo'],
  ['SHP-1013', 'PO-513', 'MetroParts', 'SKU-02', 70, 10, 10, null, 'planned', 'Samarkand', 'Steppe Line'],
  ['SHP-1014', 'PO-514', 'Altai Components', 'SKU-05', 45, -2, null, null, 'customs', 'Samarkand', 'Steppe Line'],
  ['SHP-1015', 'PO-515', 'Silk Road Motors', 'SKU-06', 250, 4, 4, null, 'in_transit', 'Samarkand', 'SilkWay Cargo'],
  ['SHP-1016', 'PO-516', 'NorthStar Parts', 'SKU-07', 30, -15, -14, -13, 'delivered', 'Tashkent', 'Caspian Freight'],
  ['SHP-1017', 'PO-517', 'EastLine Supply', 'SKU-08', 110, 6, 9, null, 'in_transit', 'Samarkand', 'SilkWay Cargo'],
  ['SHP-1018', 'PO-518', 'MetroParts', 'SKU-09', 55, -3, -1, null, 'in_transit', 'Tashkent', 'Caspian Freight'],
  ['SHP-1019', 'PO-519', 'Altai Components', 'SKU-10', 400, -25, -25, -24, 'delivered', 'Samarkand', 'Steppe Line'],
  ['SHP-1020', 'PO-520', 'Silk Road Motors', 'SKU-04', 160, 12, 12, null, 'planned', 'Tashkent', 'SilkWay Cargo'],
  ['SHP-1021', 'PO-521', 'NorthStar Parts', 'SKU-02', 90, -8, -8, -8, 'delivered', 'Tashkent', 'Caspian Freight'],
  ['SHP-1022', 'PO-522', 'EastLine Supply', 'SKU-01', 75, -1, 2, null, 'in_transit', 'Tashkent', 'SilkWay Cargo'],
  ['SHP-1023', 'PO-523', 'MetroParts', 'SKU-05', 50, 9, null, null, 'confirmed', 'Tashkent', 'Steppe Line'],
  ['SHP-1024', 'PO-524', 'Altai Components', 'SKU-03', 220, 2, 2, null, 'in_transit', 'Samarkand', 'Steppe Line'],
  ['SHP-1025', 'PO-525', 'Silk Road Motors', 'SKU-09', 35, -30, null, null, 'cancelled', 'Tashkent', 'SilkWay Cargo'],
  ['SHP-1026', 'PO-526', 'NorthStar Parts', 'SKU-06', 200, -5, -5, -7, 'delivered', 'Samarkand', 'Caspian Freight'],
  ['SHP-1027', 'PO-527', 'EastLine Supply', 'SKU-10', 350, 7, 11, null, 'in_transit', 'Samarkand', 'SilkWay Cargo'],
  ['SHP-1028', 'PO-528', 'MetroParts', 'SKU-07', 20, 1, null, null, 'in_transit', 'Tashkent', 'Caspian Freight'],
  ['SHP-1029', 'PO-529', 'Altai Components', 'SKU-08', 130, -10, -10, -12, 'delivered', 'Tashkent', 'Steppe Line'],
  ['SHP-1030', 'PO-530', 'Silk Road Motors', 'SKU-04', 140, 4, 4, null, 'confirmed', 'Samarkand', 'SilkWay Cargo'],
];

// [sku, warehouse, onHand, reserved, safetyStock, unitCost]
const INVENTORY: [string, string, number, number, number, number][] = [
  ['SKU-01', 'Tashkent', 35, 10, 40, 12.5],
  ['SKU-01', 'Samarkand', 60, 5, 30, 12.5],
  ['SKU-02', 'Tashkent', 90, 15, 30, 4.2],
  ['SKU-03', 'Tashkent', 18, 5, 35, 3.1],
  ['SKU-04', 'Samarkand', 12, 12, 50, 18.0],
  ['SKU-05', 'Tashkent', 8, 6, 20, 46.0],
  ['SKU-06', 'Tashkent', 400, 120, 100, 7.75],
  ['SKU-07', 'Samarkand', 4, 1, 10, 210.0],
  ['SKU-08', 'Tashkent', 70, 20, 40, 9.4],
  ['SKU-09', 'Tashkent', 22, 2, 25, 64.0],
  ['SKU-10', 'Tashkent', 600, 150, 300, 2.3],
  ['SKU-10', 'Samarkand', 140, 40, 200, 2.3],
];

export function demoShipmentsCsv(today: IsoDate): string {
  const header = 'shipment_id,order_id,supplier,sku,product_name,qty,planned_arrival,eta,actual_arrival,status,warehouse,carrier';
  const at = (offset: number | null) => (offset === null ? '' : addDays(today, offset));
  const lines = SHIPMENTS.map(([id, po, supplier, sku, qty, planned, eta, actual, status, wh, carrier]) =>
    [id, po, supplier, sku, PRODUCTS[sku], qty, at(planned), at(eta), at(actual), status, wh, carrier].join(','),
  );
  return [header, ...lines].join('\n');
}

export function demoInventoryCsv(today: IsoDate): string {
  const header = 'sku,product_name,warehouse,on_hand,reserved,safety_stock,unit_cost,updated_at';
  const lines = INVENTORY.map(([sku, wh, onHand, reserved, safety, cost]) =>
    [sku, PRODUCTS[sku], wh, onHand, reserved, safety, cost, today].join(','),
  );
  return [header, ...lines].join('\n');
}
