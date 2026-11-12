"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/components/auth/postJson";
import { useFormsApi } from "@/components/forms/FormsApi";

export type ClassGroup = { id: string; name: string };

/// The class groups the person can see, for naming the classes a form is for and for choosing them. Empty while loading or when they cannot be read: the API decides who may list them.
export function useClassGroups(): ClassGroup[] {
  const { api } = useFormsApi();
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`${api}/academics/class-groups?limit=100`, controller.signal);
      if (controller.signal.aborted) return;
      const rows = (reply.data?.classGroups ?? []) as ClassGroup[];
      setClassGroups(reply.ok ? rows.map((g) => ({ id: g.id, name: g.name })) : []);
    })();
    return () => controller.abort();
  }, [api]);
  return classGroups;
}
