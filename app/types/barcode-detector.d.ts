// Barcode Detection API — not yet in TypeScript's bundled DOM lib.
// Support: Chrome/Edge/Android Chrome; not Safari/iOS (see ScanTarget.vue).
interface DetectedBarcode {
  rawValue: string
  format: string
}

declare class BarcodeDetector {
  constructor(options?: { formats: string[] })
  static getSupportedFormats(): Promise<string[]>
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector
}
