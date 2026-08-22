import { Routes, Route, Navigate } from "react-router-dom";
import LoginScreen from "../../feature/auth/view/LoginScreen";
import OperationScreen from "../../feature/operation/view/OperationScreen";
import ProductCrudScreen from "../../feature/product/view/ProductCrudScreen";
import IngredientsScreen from "../../feature/ingredient/view/IngredientsScreen";
import MenuProductsScreen from "../../feature/menu/view/MenuProductsScreen";
import PriceScreen from "../../feature/product/view/PriceScreen";
import FinanceScreen from "../../feature/finance/view/FinanceScreen";
import UsersScreen from "../../feature/user/view/UsersScreen";
import StockEntryScreen from "../../feature/stock/view/StockEntryScreen";
import SalesScreen from "../../feature/sale/view/SalesScreen";
import SalesSummaryScreen from "../../feature/sale/view/SalesSummaryScreen";
import CashScreen from "../../feature/cash/view/CashScreen";
import WorkdaysScreen from "../../feature/cash/view/WorkdaysScreen";
import ReportsScreen from "../../feature/report/view/ReportsScreen";
import SupplyOrdersScreen from "../../feature/supply/view/SupplyOrdersScreen";
import SupplyReceivingScreen from "../../feature/supply/view/SupplyReceivingScreen";
import OperationRequestsScreen from "../../feature/request/view/OperationRequestsScreen";
import ApproveRequestsScreen from "../../feature/request/view/ApproveRequestsScreen";
import ExpensesScreen from "../../feature/expense/view/ExpensesScreen";
import FeedbackScreen from "../../feature/feedback/view/FeedbackScreen";
import LicensesScreen from "../../feature/license/view/LicensesScreen";
import NotificationsScreen from "../../feature/notification/view/NotificationsScreen";
import DataScreen from "../../feature/data/view/DataScreen";
import TransactionsScreen from "../../feature/transaction/view/TransactionsScreen";
import HelpScreen from "../../feature/help/view/HelpScreen";
import AutoSaleScreen from "../../feature/autosale/view/AutoSaleScreen";
import RequireAuth from "./RequireAuth";
import RequireRole from "./RequireRole";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />

      <Route element={<RequireAuth />}>
        <Route path="/operation" element={<OperationScreen />} />
        <Route element={<RequireRole allowedRoles={["admin", "operator"]} />}>
          <Route path="/products" element={<Navigate to="/products/new" replace />} />
          <Route path="/products/new" element={<ProductCrudScreen />} />
          <Route path="/ingredients/manage" element={<IngredientsScreen />} />
          <Route path="/menu-products/manage" element={<MenuProductsScreen />} />
          <Route path="/stock" element={<StockEntryScreen />} />
          <Route path="/cash" element={<CashScreen />} />
          <Route path="/sales" element={<SalesScreen />} />
          <Route path="/sales/summary" element={<SalesSummaryScreen />} />
          <Route path="/supplies/receiving" element={<SupplyReceivingScreen />} />
          <Route path="/requests" element={<OperationRequestsScreen />} />
          <Route path="/expenses" element={<ExpensesScreen />} />
          <Route path="/feedback" element={<FeedbackScreen />} />
          <Route path="/notifications" element={<NotificationsScreen />} />
          <Route path="/help" element={<HelpScreen />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["admin"]} />}>
          <Route path="/prices" element={<PriceScreen />} />
          <Route path="/finances" element={<FinanceScreen />} />
          <Route path="/users" element={<UsersScreen />} />
          <Route path="/workdays" element={<WorkdaysScreen />} />
          <Route path="/balance" element={<ReportsScreen />} />
          <Route path="/reports" element={<Navigate to="/balance" replace />} />
          <Route path="/supplies/orders" element={<SupplyOrdersScreen />} />
          <Route path="/requests/approvals" element={<ApproveRequestsScreen />} />
          <Route path="/licenses" element={<LicensesScreen />} />
          <Route path="/transactions" element={<TransactionsScreen />} />
          <Route path="/data" element={<DataScreen />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["admin", "terminal"]} />}>
          <Route path="/autoventa" element={<AutoSaleScreen />} />
        </Route>
      </Route>

      {/* default */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
