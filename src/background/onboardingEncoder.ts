import { env, pipeline } from "@xenova/transformers"
import { log } from "~/lib/logger"

// ================================
// ONBOARDING-SPECIFIC ENCODER
// Separate instance to avoid circular dependencies
// Used only during initial history import
// ================================

// Use same MV3 configuration as main embedding engine
env.backends.onnx.wasm.numThreads = 1
env.backends.onnx.wasm.simd = false
env.backends.onnx.wasm.proxy = false

if (env.backends.onnx.webgpu) {
  env.backends.onnx.webgpu = false as any
}
if (env.backends.onnx.webnn) {
  env.backends.onnx.webnn = false as any
}

env.allowRemoteModels = true
env.allowLocalModels = true
env.useBrowserCache = true
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("assets/")

const MODEL_ID = "Xenova/all-MiniLM-L6-v2"

type SimpleEmbeddingPipeline = (...args: any[]) => Promise<any>

export interface OnboardingProgress {
  isModelLoading: boolean
  modelLoadPercent: number
  totalPages: number
  processedPages: number
  embeddingsGenerated: number
  isComplete: boolean
}

export interface OnboardingEncoderConfig {
  batchSize?: number // Pages per batch (default: 10)
  batchDelay?: number // Delay between batches in ms (default: 50)
  onProgress?: (progress: OnboardingProgress) => void
}

/**
 * Dedicated encoder for onboarding history processing
 * Automatically disposes after completion to free memory
 */
export class OnboardingEncoder {
  private pipeline: SimpleEmbeddingPipeline | null = null
  private isDisposed = false
  private config: Required<OnboardingEncoderConfig>

  constructor(config: OnboardingEncoderConfig = {}) {
    this.config = {
      batchSize: config.batchSize || 10,
      batchDelay: config.batchDelay || 50,
      onProgress: config.onProgress || (() => {}),
    }
  }

  /**
   * Initialize the model with progress tracking
   */
  async initialize(): Promise<boolean> {
    if (this.isDisposed) {
      console.log("[OnboardingEncoder] ❌ Cannot initialize: encoder is disposed")
      log("[OnboardingEncoder] Cannot initialize: encoder is disposed")
      return false
    }

    if (this.pipeline) {
      console.log("[OnboardingEncoder] ✅ Model already initialized")
      return true
    }

    try {
      console.log("[OnboardingEncoder] 🔄 Initializing model...")
      log("[OnboardingEncoder] 🔄 Initializing model...")

      // Notify model loading started
      this.config.onProgress({
        isModelLoading: true,
        modelLoadPercent: 0,
        totalPages: 0,
        processedPages: 0,
        embeddingsGenerated: 0,
        isComplete: false,
      })

      // Check if model is already cached
      const isModelCached = await this.checkModelCache()
      
      if (isModelCached) {
        log("[OnboardingEncoder] Model found in cache, loading...")
        this.config.onProgress({
          isModelLoading: true,
          modelLoadPercent: 100,
          totalPages: 0,
          processedPages: 0,
          embeddingsGenerated: 0,
          isComplete: false,
        })
      } else {
        log("[OnboardingEncoder] Model not cached, downloading (~30MB)...")
      }

      this.pipeline = (await pipeline(
        "feature-extraction",
        MODEL_ID,
        {
          device: "wasm",
          quantized: true,
          executionProviders: ["wasm"],
        } as any
      )) as SimpleEmbeddingPipeline

      log("[OnboardingEncoder] ✅ Model loaded successfully")

      // Notify model loading complete
      this.config.onProgress({
        isModelLoading: false,
        modelLoadPercent: 100,
        totalPages: 0,
        processedPages: 0,
        embeddingsGenerated: 0,
        isComplete: false,
      })

      return true
    } catch (error) {
      console.error("[OnboardingEncoder] ❌ Failed to load model:", error)
      this.pipeline = null
      return false
    }
  }

  /**
   * Check if model files are cached
   */
  private async checkModelCache(): Promise<boolean> {
    try {
      // Check chrome.storage for model-initialized flag
      const result = await chrome.storage.local.get("model-initialized")
      return result["model-initialized"] === true
    } catch {
      return false
    }
  }

  /**
   * Generate a single embedding
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    if (this.isDisposed) {
      log("[OnboardingEncoder] Cannot generate: encoder is disposed")
      return null
    }

    if (!text) return null

    if (!this.pipeline) {
      const initialized = await this.initialize()
      if (!initialized) return null
    }

    try {
      const output: any = await this.pipeline!(text, {
        pooling: "mean",
        normalize: true,
      })

      if (output?.data) {
        return Array.from(output.data as Iterable<number>)
      }

      if (Array.isArray(output?.[0])) {
        return output[0].map(Number)
      }

      return null
    } catch (error) {
      console.error("[OnboardingEncoder] Embedding generation failed:", error)
      return null
    }
  }

  /**
   * Process pages in batches with delays
   * @param pages Array of pages with url, title, and timestamp
   * @param updateCallback Called after each successful embedding with updated page
   * @returns Number of embeddings generated
   */
  async processPagesInBatches(
    pages: Array<{ url: string; title: string; timestamp: number }>,
    updateCallback: (page: { url: string; title: string; timestamp: number; embedding: number[] }) => Promise<void>
  ): Promise<number> {
    if (this.isDisposed) {
      log("[OnboardingEncoder] Cannot process: encoder is disposed")
      return 0
    }

    // Initialize model first
    const initialized = await this.initialize()
    if (!initialized) {
      log("[OnboardingEncoder] Initialization failed, aborting")
      return 0
    }

    const totalPages = pages.length
    let processedPages = 0
    let embeddingsGenerated = 0

    console.log(`[OnboardingEncoder] 🚀 Starting batch processing: ${totalPages} pages, batch size: ${this.config.batchSize}`)
    log(`[OnboardingEncoder] Starting batch processing: ${totalPages} pages, batch size: ${this.config.batchSize}`)

    // Process in batches
    for (let i = 0; i < totalPages; i += this.config.batchSize) {
      const batch = pages.slice(i, Math.min(i + this.config.batchSize, totalPages))

      // Process batch
      for (const page of batch) {
        if (this.isDisposed) {
          log("[OnboardingEncoder] Processing stopped: encoder disposed")
          return embeddingsGenerated
        }

        try {
          const embedding = await this.generateEmbedding(page.title)
          if (embedding) {
            await updateCallback({ ...page, embedding })
            embeddingsGenerated++
          }
        } catch (error) {
          // Skip failed embeddings
          log("[OnboardingEncoder] Failed to process page:", page.url)
        }

        processedPages++

        // Report progress after each page
        this.config.onProgress({
          isModelLoading: false,
          modelLoadPercent: 100,
          totalPages,
          processedPages,
          embeddingsGenerated,
          isComplete: false,
        })
      }

      // Delay between batches (except after last batch)
      if (i + this.config.batchSize < totalPages) {
        await new Promise((resolve) => setTimeout(resolve, this.config.batchDelay))
      }

      // Log progress every batch
      console.log(
        `[OnboardingEncoder] ✅ Batch complete: ${processedPages}/${totalPages} (${embeddingsGenerated} embeddings)`
      )
      log(
        `[OnboardingEncoder] Batch complete: ${processedPages}/${totalPages} (${embeddingsGenerated} embeddings)`
      )
    }

    // Report completion
    this.config.onProgress({
      isModelLoading: false,
      modelLoadPercent: 100,
      totalPages,
      processedPages,
      embeddingsGenerated,
      isComplete: true,
    })

    log(`[OnboardingEncoder] ✅ Processing complete: ${embeddingsGenerated}/${totalPages} embeddings generated`)

    return embeddingsGenerated
  }

  /**
   * Dispose the encoder and free resources
   * Call this after onboarding is complete
   */
  dispose(): void {
    if (this.isDisposed) return

    log("[OnboardingEncoder] 🗑️ Disposing encoder...")
    this.pipeline = null
    this.isDisposed = true
    log("[OnboardingEncoder] ✅ Encoder disposed")
  }

  /**
   * Check if encoder is disposed
   */
  isEncoderDisposed(): boolean {
    return this.isDisposed
  }
}
