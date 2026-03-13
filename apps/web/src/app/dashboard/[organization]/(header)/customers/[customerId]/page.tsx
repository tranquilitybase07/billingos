"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CustomerDetailPageProps {
  params: Promise<{ organization: string; customerId: string }>;
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { organization, customerId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/dashboard/${organization}/customers?customer=${customerId}`);
  }, [organization, customerId, router]);

  return null;
}
