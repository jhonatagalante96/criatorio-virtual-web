"use client";

import React from "react";
import { AuthProvider } from "../../lib/auth/auth-context";
import { TransferListScreen } from "./transfer-list-screen";

export default function TransferListPage() {
  return <AuthProvider><TransferListScreen /></AuthProvider>;
}
