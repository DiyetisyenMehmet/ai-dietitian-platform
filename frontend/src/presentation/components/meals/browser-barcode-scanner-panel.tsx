"use client";

import * as React from "react";
import { Camera, Search, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/infrastructure/api/http-client";
import {
  nutritionClient,
  type CanonicalFoodDto,
} from "@/infrastructure/nutrition/nutrition-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function detectorConstructor(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

function validBarcode(value: string): string {
  const normalized = value.replace(/\D/g, "");
  return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(normalized) ? normalized : "";
}

export function BrowserBarcodeScannerPanel() {
  const [barcode, setBarcode] = React.useState("");
  const [food, setFood] = React.useState<CanonicalFoodDto | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [cameraActive, setCameraActive] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const scanningRef = React.useRef(false);

  const stopCamera = React.useCallback(() => {
    scanningRef.current = false;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  React.useEffect(() => stopCamera, [stopCamera]);

  const lookup = React.useCallback(async (raw: string) => {
    const code = validBarcode(raw);
    if (!code) {
      toast.error("Geçerli bir GTIN / EAN / UPC barkodu girin.");
      return;
    }

    setBarcode(code);
    setLoading(true);
    setFood(null);
    setNotFound(false);
    try {
      const result = await nutritionClient.barcode(code);
      setFood(result.food);
      setNotFound(!result.found || !result.food);
      if (!result.found || !result.food) {
        toast.message("Bu barkod için doğrulanmış ürün bilgisi bulunamadı.");
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Barkod sorgulanamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  const startCamera = React.useCallback(async () => {
    if (cameraActive || loading) return;
    const Detector = detectorConstructor();
    if (!Detector) {
      toast.error("Bu tarayıcı yerleşik barkod çözmeyi desteklemiyor. Barkodu elle girebilirsin.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      // The video element is permanently mounted (only visually hidden while
      // inactive), so srcObject can be attached immediately after permission.
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("camera preview unavailable");
      }

      streamRef.current = stream;
      video.srcObject = stream;
      setCameraActive(true);
      await video.play();

      scanningRef.current = true;
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "itf"] });

      const frame = async () => {
        const current = videoRef.current;
        if (!scanningRef.current || !current) return;
        if (current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const hits = await detector.detect(current);
            const code = hits.map((hit) => validBarcode(hit.rawValue)).find(Boolean);
            if (code) {
              stopCamera();
              void lookup(code);
              return;
            }
          } catch {
            // Frame decode can fail transiently while autofocus/exposure settles.
          }
        }
        timerRef.current = window.setTimeout(() => void frame(), 200);
      };

      void frame();
    } catch (error) {
      stopCamera();
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      toast.error(
        denied
          ? "Barkod taramak için kamera izni gerekiyor."
          : "Kamera açılamadı. Tarayıcı kamera ayarını kontrol edin.",
      );
    }
  }, [cameraActive, loading, lookup, stopCamera]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="font-bold">Barkod Tara</h2>
            <p className="text-sm text-muted-foreground">
              Barkod cihazında çözülür; sunucuya kamera görüntüsü değil yalnız barkod numarası gönderilir.
            </p>
          </div>

          <div className={cameraActive ? "overflow-hidden rounded-2xl border bg-black" : "hidden"}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="aspect-video w-full object-cover"
              aria-label="Barkod kamera önizlemesi"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void startCamera()} disabled={cameraActive || loading}>
              <Camera /> {cameraActive ? "Kamera açık" : "Kamerayı aç"}
            </Button>
            <Button variant="outline" onClick={stopCamera} disabled={!cameraActive}>
              <Square /> Durdur
            </Button>
          </div>

          <div className="flex gap-2">
            <input
              value={barcode}
              onChange={(event) => setBarcode(event.target.value.replace(/\D/g, "").slice(0, 14))}
              onKeyDown={(event) => {
                if (event.key === "Enter") void lookup(barcode);
              }}
              inputMode="numeric"
              placeholder="GTIN / EAN / UPC barkod numarası"
              className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
            />
            <Button
              variant="outline"
              onClick={() => void lookup(barcode)}
              isLoading={loading}
              disabled={loading || !validBarcode(barcode)}
            >
              <Search /> Sorgula
            </Button>
          </div>
        </CardContent>
      </Card>

      {notFound && (
        <Card>
          <CardContent className="flex gap-3 p-5 text-sm">
            <TriangleAlert className="size-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Bu ürün veritabanında bulunamadı</p>
              <p className="text-muted-foreground">
                Ana barkod ekranında paket etiketini tarayarak kullanıcı doğrulamalı kayıt oluşturabilirsin.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {food && (
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Ürün bulundu</p>
            <h3 className="text-lg font-bold">{food.displayNameTr || food.name}</h3>
            {food.brand && <p className="text-sm text-muted-foreground">{food.brand}</p>}
            <p className="text-xs tabular-nums text-muted-foreground">Barkod: {food.barcode}</p>
            <p className="text-xs text-muted-foreground">
              Ayrıntılı besin değerlendirmesi doğrulanmış ürün verisi üzerinden hazırlanır.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
