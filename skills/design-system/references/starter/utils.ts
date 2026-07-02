// The house class-merge helper. Every component composes classes through cn():
// clsx resolves conditionals/arrays, tailwind-merge dedupes conflicting Tailwind
// utilities so the last one wins (e.g. cn("px-2", "px-4") → "px-4"). Place at
// src/lib/utils.ts — the "@/lib/utils" alias in components.json points here.
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
