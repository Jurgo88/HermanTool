import { sk } from '~/i18n/sk'

// The Slovak name of an Asset status (D-20). The raw value only if a status
// ever arrives before its label does.
export function assetStatusLabel(status: string): string {
  return (sk.adminAssetRegistry.assetStatus as Record<string, string>)[status] ?? status
}
