// GPU memory optimization for different configurations

interface GPUProfile {
  vram: number; // in GB
  model: string;
  recommendedLayers: number;
  maxContext: number;
  notes: string;
}

const GPU_PROFILES: GPUProfile[] = [
  // 8GB VRAM configurations
  {
    vram: 8,
    model: 'qwen2.5vl:3b',
    recommendedLayers: 22,
    maxContext: 65536,
    notes: 'Balanced performance with 8GB VRAM, leaves ~1.5GB for system'
  },
  {
    vram: 8,
    model: 'llava:7b',
    recommendedLayers: 24,
    maxContext: 4096,
    notes: 'Llava uses less memory, can use more layers'
  },
  
  // 6GB VRAM configurations
  {
    vram: 6,
    model: 'qwen2.5vl:3b',
    recommendedLayers: 16,
    maxContext: 32768,
    notes: 'Conservative settings for 6GB VRAM'
  },
  
  // 12GB+ VRAM configurations
  {
    vram: 12,
    model: 'qwen2.5vl:3b',
    recommendedLayers: 999, // All layers
    maxContext: 125000,
    notes: 'Full GPU acceleration with 12GB+ VRAM'
  }
];

export function getOptimalGPUConfig(vramGB: number, modelName: string): {
  numGpu: number;
  numContext: number;
  notes: string;
} {
  // Find the best matching profile
  const profile = GPU_PROFILES
    .filter(p => p.model === modelName && p.vram <= vramGB)
    .sort((a, b) => b.vram - a.vram)[0];
  
  if (!profile) {
    // Fallback for unknown configurations
    if (vramGB < 6) {
      return {
        numGpu: 0, // CPU only
        numContext: 16384,
        notes: 'Insufficient VRAM, using CPU only'
      };
    }
    
    // Conservative estimate for unknown configs
    const layersPerGB = 3; // Rough estimate
    return {
      numGpu: Math.floor(vramGB * layersPerGB),
      numContext: Math.min(125000, vramGB * 8192),
      notes: `Estimated configuration for ${vramGB}GB VRAM`
    };
  }
  
  return {
    numGpu: profile.recommendedLayers,
    numContext: profile.maxContext,
    notes: profile.notes
  };
}

// Memory usage estimation
export function estimateVRAMUsage(
  modelSize: number, // in GB
  numLayers: number,
  totalLayers: number,
  contextLength: number
): number {
  // Base model memory (proportional to layers on GPU)
  const modelMemory = (modelSize * numLayers) / totalLayers;
  
  // Context memory (rough estimate: 2 bytes per token)
  const contextMemory = (contextLength * 2) / (1024 * 1024 * 1024); // Convert to GB
  
  // Overhead (activation, cache, etc.) ~20%
  const overhead = (modelMemory + contextMemory) * 0.2;
  
  return modelMemory + contextMemory + overhead;
}

// Adaptive configuration based on errors
export function adjustConfigForOOM(currentConfig: {
  numGpu: number;
  numContext: number;
}): {
  numGpu: number;
  numContext: number;
  adjusted: boolean;
} {
  // Reduce GPU layers by 25%
  const newNumGpu = Math.max(0, Math.floor(currentConfig.numGpu * 0.75));
  
  // Reduce context by 50%
  const newNumContext = Math.max(4096, Math.floor(currentConfig.numContext * 0.5));
  
  return {
    numGpu: newNumGpu,
    numContext: newNumContext,
    adjusted: true
  };
}