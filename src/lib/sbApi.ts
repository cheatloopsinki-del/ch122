import { settingsService, categoryService, productService } from './supabase';

export async function getSettings(): Promise<Record<string, string>> {
  return await settingsService.getSettings();
}

export async function listCategories(): Promise<any[]> {
  return await categoryService.getAllCategories();
}

export async function listVisibleProducts(): Promise<any[]> {
  return await productService.getVisibleProducts();
}
