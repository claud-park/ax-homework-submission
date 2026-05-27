import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseName(rawName: string): { displayName: string; department: string } {
  const parts = rawName.split('/')
  return {
    displayName: parts[0]?.trim() ?? rawName,
    department: parts[1]?.trim() ?? '',
  }
}
