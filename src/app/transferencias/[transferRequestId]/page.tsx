"use client";

import React from "react";
import { useParams } from "next/navigation";
import { AuthProvider } from "../../../lib/auth/auth-context";
import { TransferDetailScreen } from "../transfer-detail-screen";

export default function TransferDetailsPage() {
  const params = useParams<{ transferRequestId: string }>();
  return <AuthProvider><TransferDetailScreen transferRequestId={params.transferRequestId} /></AuthProvider>;
}
