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
  "workdays": [
    {
      "id": "wd030920260524295407",
      "operator": "admin",
      "startedAt": "2026-09-03T08:24:29.482Z",
      "endedAt": "2026-09-03T08:24:37.485Z",
      "orderIds": [],
      "status": "closed",
      "openingDeclaredAmount": 5000,
      "openingDifferenceAmount": 0,
      "closeRequestedAt": "2026-09-03T08:24:34.945Z",
      "closeSummary": {
        "totalSales": 0,
        "totalByPaymentMethod": {
          "efectivo": 0,
          "tarjeta debito": 0,
          "tarjeta credito": 0,
          "mercadopago": 0
        },
        "cashSales": 0,
        "totalExpenses": 0,
        "totalSupplyReturns": 0,
        "expectedClosingCash": 5000,
        "declaredClosingCash": 5000,
        "closingDifference": 0,
        "balanceTotal": 5000
      },
      "adminReview": {
        "reviewedBy": "admin",
        "reviewedAt": "2026-09-03T08:24:37.485Z",
        "checks": {
          "openingAmount": true,
          "cashSales": true,
          "expenses": true,
          "supplyReturns": true,
          "balance": true
        }
      }
    }
  ],
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
      "currentBalance": 5000,
      "createdAt": "2026-09-03T04:42:20.732Z",
      "updatedAt": "2026-09-03T08:24:37.486Z"
    },
    {
      "id": "account-gains",
      "code": "gains",
      "name": "Ganancias",
      "kind": "income",
      "description": "Ventas pagadas registradas por la plataforma.",
      "currentBalance": 0,
      "createdAt": "2026-09-03T04:42:20.732Z",
      "updatedAt": "2026-09-03T08:24:37.486Z"
    },
    {
      "id": "account-expenses",
      "code": "expenses",
      "name": "Gastos",
      "kind": "expense",
      "description": "Egresos confirmados por gastos y pagos de mercaderia.",
      "currentBalance": 0,
      "createdAt": "2026-09-03T04:42:20.732Z",
      "updatedAt": "2026-09-03T08:24:37.486Z"
    },
    {
      "id": "account-food-categories",
      "code": "food-categories",
      "name": "Categorias de comida",
      "kind": "category",
      "description": "Movimientos asociados a ventas agrupadas por categorias de comida.",
      "currentBalance": 0,
      "createdAt": "2026-09-03T04:42:20.732Z",
      "updatedAt": "2026-09-03T08:24:37.486Z"
    }
  ],
  "financialTransactions": [
    {
      "id": "txn-cash-close-wd030920260524295407",
      "createdAt": "2026-09-03T08:24:37.485Z",
      "type": "cash-close",
      "title": "Cierre de caja wd030920260524295407",
      "description": "Se dejo 5000 al cerrar la jornada wd030920260524295407.",
      "amount": 5000,
      "direction": "out",
      "entryKind": "debit",
      "accountId": "account-cash-local",
      "referenceModule": "cash",
      "referenceId": "wd030920260524295407",
      "workdayId": "wd030920260524295407",
      "actor": "admin",
      "countsInBalance": false,
      "accountCode": "cash-local",
      "accountName": "Caja fisica local"
    },
    {
      "id": "txn-cash-opening-wd030920260524295407",
      "createdAt": "2026-09-03T08:24:29.482Z",
      "type": "cash-opening",
      "title": "Apertura de caja wd030920260524295407",
      "description": "Apertura declarada por admin.",
      "amount": 5000,
      "direction": "in",
      "entryKind": "credit",
      "accountId": "account-cash-local",
      "referenceModule": "cash",
      "referenceId": "wd030920260524295407",
      "workdayId": "wd030920260524295407",
      "actor": "admin",
      "countsInBalance": true,
      "accountCode": "cash-local",
      "accountName": "Caja fisica local"
    }
  ],
  "licenses": [],
  "notifications": [
    {
      "id": "nt030920260524371773",
      "type": "cash-closed",
      "title": "Caja cerrada: admin",
      "description": "Se cerro la jornada wd030920260524295407.",
      "createdAt": "2026-09-03T08:24:37.485Z",
      "dueAt": "2026-09-04T08:24:37.485Z",
      "isFixed": false,
      "requiresAction": false,
      "entityType": "workday",
      "entityId": "wd030920260524295407",
      "status": "active"
    },
    {
      "id": "nt030920260524341669",
      "type": "cash",
      "title": "Cierre de caja pendiente: admin",
      "description": "La jornada wd030920260524295407 fue enviada para auditoria.",
      "createdAt": "2026-09-03T08:24:34.945Z",
      "dueAt": "2026-09-10T08:24:34.945Z",
      "isFixed": false,
      "requiresAction": true,
      "actionLabel": "Auditar cierre",
      "entityType": "workday",
      "entityId": "wd030920260524295407",
      "status": "received",
      "receivedAt": "2026-09-03T08:24:37.485Z"
    },
    {
      "id": "nt030920260524295570",
      "type": "cash-opened",
      "title": "Caja abierta: admin",
      "description": "Se abrio caja para admin con 5000.",
      "createdAt": "2026-09-03T08:24:29.482Z",
      "dueAt": "2026-09-04T08:24:29.482Z",
      "isFixed": false,
      "requiresAction": false,
      "entityType": "workday",
      "entityId": "wd030920260524295407",
      "status": "received",
      "receivedAt": "2026-09-03T08:24:37.485Z"
    }
  ],
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
