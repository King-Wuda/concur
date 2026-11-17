"use client";

import { createContext, useContext } from "react";

import { categoryList, colorOf, type CategoryInfo } from "@/lib/categories";

/**
 * Every category - the six built-in ones plus your own and your trips' - for
 * the forms and charts that offer or colour them. Loaded once in the layout.
 */
const CategoriesContext = createContext<CategoryInfo[]>(categoryList());

export function CategoriesProvider({
  categories,
  children,
}: {
  categories: CategoryInfo[];
  children: React.ReactNode;
}) {
  return <CategoriesContext.Provider value={categories}>{children}</CategoriesContext.Provider>;
}

export function useCategories(): CategoryInfo[] {
  return useContext(CategoriesContext);
}

/** A category's colour from the current list. */
export function useCategoryColor(): (name: string) => string {
  const list = useCategories();
  return (name) => colorOf(name, list);
}

/**
 * The <option>s for a category picker. A category no longer in the list (one
 * since removed) still shows, so a receipt that has it can be saved as is.
 */
export function CategoryOptions({ current }: { current?: string }) {
  const list = useCategories();
  const names = list.map((c) => c.name);
  const builtIn = list.filter((c) => c.kind === "builtin");
  const custom = list.filter((c) => c.kind === "custom");
  const trips = list.filter((c) => c.kind === "trip");
  return (
    <>
      {current && !names.includes(current) && <option value={current}>{current}</option>}
      {builtIn.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
      {custom.length > 0 && (
        <optgroup label="Your categories">
          {custom.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {trips.length > 0 && (
        <optgroup label="Trips">
          {trips.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
