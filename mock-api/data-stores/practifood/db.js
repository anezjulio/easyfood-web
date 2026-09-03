{
  "products": [],
  "productPrices": [],
  "ingredients": [],
  "menuProducts": [],
  "users": [
    {
      "id": "u140220260500000001",
      "name": "Administrador",
      "email": "admin@easyfood.local",
      "username": "admin",
      "password": "81dc9bdb52d04dc20036dbd8313ed055",
      "createdAt": "2026-02-14T08:00:00.000Z",
      "updatedAt": "2026-02-14T08:00:00.000Z",
      "startHour": "08:00",
      "endHour": "18:00"
    },
    {
      "id": "u140220260505000002",
      "name": "Operador Base",
      "email": "user@easyfood.local",
      "username": "user",
      "password": "81dc9bdb52d04dc20036dbd8313ed055",
      "createdAt": "2026-02-14T08:05:00.000Z",
      "updatedAt": "2026-02-14T08:05:00.000Z",
      "startHour": "08:00",
      "endHour": "17:00"
    },
    {
      "id": "u040520260300000010",
      "name": "Terminal Principal",
      "email": "terminal@easyfood.local",
      "username": "terminal",
      "role": "terminal",
      "password": "81dc9bdb52d04dc20036dbd8313ed055",
      "createdAt": "2026-05-04T03:00:00.000Z",
      "updatedAt": "2026-05-04T03:00:00.000Z",
      "startHour": "00:00",
      "endHour": "23:59"
    },
    {
      "id": "u140220260510000001",
      "name": "Operador Uno",
      "email": "operador1@easyfood.local",
      "username": "operador1",
      "password": "81dc9bdb52d04dc20036dbd8313ed055",
      "createdAt": "2026-02-14T08:10:00.000Z",
      "updatedAt": "2026-02-14T08:10:00.000Z",
      "startHour": "09:00",
      "endHour": "17:00"
    },
    {
      "id": "u140220260515000002",
      "name": "Operador Dos",
      "email": "operador2@easyfood.local",
      "username": "operador2",
      "password": "81dc9bdb52d04dc20036dbd8313ed055",
      "createdAt": "2026-02-14T08:15:00.000Z",
      "updatedAt": "2026-02-14T08:15:00.000Z",
      "startHour": "10:00",
      "endHour": "18:00"
    },
    {
      "id": "u140220260520000003",
      "name": "Operador Tres",
      "email": "operador3@easyfood.local",
      "username": "operador3",
      "password": "81dc9bdb52d04dc20036dbd8313ed055",
      "createdAt": "2026-02-14T08:20:00.000Z",
      "updatedAt": "2026-02-14T08:20:00.000Z",
      "startHour": "12:00",
      "endHour": "20:00"
    }
  ],
  "deleteRequests": [],
  "requests": [],
  "stocks": [],
  "orders": [],
  "invoices": [],
  "workdays": [],
  "cashOpeningAssignments": [],
  "supplyOrders": [],
  "expenses": [],
  "feedbackEntries": [],
  "financialAccounts": [
    {
      "id": "account-cash-local",
      "code": "cash-local",
      "name": "Caja fisica local",
      "kind": "asset",
      "description": "Efectivo declarado en aperturas, ventas en efectivo, pagos y vueltos del local.",
      "currentBalance": 0,
      "createdAt": "2026-09-03T04:42:20.732Z",
      "updatedAt": "2026-09-03T04:42:20.732Z"
    },
    {
      "id": "account-gains",
      "code": "gains",
      "name": "Ganancias",
      "kind": "income",
      "description": "Ventas pagadas registradas por la plataforma.",
      "currentBalance": 0,
      "createdAt": "2026-09-03T04:42:20.732Z",
      "updatedAt": "2026-09-03T04:42:20.732Z"
    },
    {
      "id": "account-expenses",
      "code": "expenses",
      "name": "Gastos",
      "kind": "expense",
      "description": "Egresos confirmados por gastos y pagos de mercaderia.",
      "currentBalance": 0,
      "createdAt": "2026-09-03T04:42:20.732Z",
      "updatedAt": "2026-09-03T04:42:20.732Z"
    },
    {
      "id": "account-food-categories",
      "code": "food-categories",
      "name": "Categorias de comida",
      "kind": "category",
      "description": "Movimientos asociados a ventas agrupadas por categorias de comida.",
      "currentBalance": 0,
      "createdAt": "2026-09-03T04:42:20.732Z",
      "updatedAt": "2026-09-03T04:42:20.732Z"
    }
  ],
  "financialTransactions": [],
  "licenses": [],
  "notifications": [],
  "notificationSettings": [
    {
      "type": "license-required",
      "leadDays": 21,
      "durationDays": 0
    },
    {
      "type": "license-expiring",
      "leadDays": 21,
      "durationDays": 7
    },
    {
      "type": "product-expiring",
      "leadDays": 21,
      "durationDays": 7
    },
    {
      "type": "product-low-stock",
      "leadDays": 0,
      "durationDays": 0
    },
    {
      "type": "expense-created",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "sale-created",
      "leadDays": 0,
      "durationDays": 1
    },
    {
      "type": "supply-requested",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "supply-approved",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "supply-received",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "supply-pending-receive",
      "leadDays": 0,
      "durationDays": 0
    },
    {
      "type": "cash-opened",
      "leadDays": 0,
      "durationDays": 1
    },
    {
      "type": "cash-closed",
      "leadDays": 0,
      "durationDays": 1
    },
    {
      "type": "cash",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "user-created",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "user-updated",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "user-deleted",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "price-changed",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "product-created",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "stock-created",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "operation-request-merchandise",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "operation-request-permissions",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "operation-request-reviewed",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "manual-fixed",
      "leadDays": 0,
      "durationDays": 0
    },
    {
      "type": "manual-action",
      "leadDays": 0,
      "durationDays": 7
    },
    {
      "type": "manual-due",
      "leadDays": 0,
      "durationDays": 7
    }
  ],
  "stockThresholdSettings": {
    "categoryThresholds": {
      "bebida": 10,
      "hamburguesa": 10,
      "pancho": 10,
      "combos": 10,
      "papas": 10,
      "pollo": 10,
      "vegano": 10
    },
    "productThresholds": []
  },
  "priceMarginSettings": {
    "categoryMargins": {
      "bebida": 30,
      "hamburguesa": 30,
      "pancho": 30,
      "combos": 30,
      "papas": 30,
      "pollo": 30,
      "vegano": 30
    },
    "productMargins": [],
    "categoryMarginHistory": [],
    "productMarginHistory": []
  },
  "paymentMethodSettings": {
    "methods": [
      {
        "method": "efectivo",
        "discountPercent": 0,
        "surchargePercent": 0
      },
      {
        "method": "tarjeta debito",
        "discountPercent": 0,
        "surchargePercent": 0
      },
      {
        "method": "tarjeta credito",
        "discountPercent": 0,
        "surchargePercent": 8
      },
      {
        "method": "mercadopago",
        "discountPercent": 0,
        "surchargePercent": 0
      }
    ]
  },
  "taxSettings": {
    "ivaPercent": 21,
    "mode": "show_only"
  }
}
