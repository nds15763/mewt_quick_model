// Audio feature extraction functions

// Calculate zero crossing rate
export const calculateZCR = (buffer) => {
  let zcr = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i - 1] >= 0 && buffer[i] < 0) || (buffer[i - 1] < 0 && buffer[i] >= 0)) {
      zcr++;
    }
  }
  return zcr / buffer.length;
};

// Calculate spectral centroid
export const calculateSpectralCentroid = (buffer) => {
  // Apply a simple FFT-like approach using autocorrelation for estimation
  // In a production environment, you'd use a proper FFT library
  let sum = 0;
  let weightedSum = 0;
  
  for (let i = 0; i < buffer.length; i++) {
    const magnitude = Math.abs(buffer[i]);
    sum += magnitude;
    weightedSum += i * magnitude;
  }
  
  return sum !== 0 ? weightedSum / sum : 0;
};

// Calculate spectral rolloff
export const calculateSpectralRolloff = (buffer) => {
  const threshold = 0.85; // 85% of total energy
  let sum = 0;
  let cumulativeSum = 0;
  
  // Calculate total energy
  for (let i = 0; i < buffer.length; i++) {
    sum += Math.abs(buffer[i]);
  }
  
  // Find the point where cumulative energy exceeds threshold
  for (let i = 0; i < buffer.length; i++) {
    cumulativeSum += Math.abs(buffer[i]);
    if (cumulativeSum >= threshold * sum) {
      return i / buffer.length;
    }
  }
  
  return 1.0;
};

// Calculate energy
export const calculateEnergy = (buffer) => {
  let energy = 0;
  for (let i = 0; i < buffer.length; i++) {
    energy += buffer[i] * buffer[i];
  }
  return energy / buffer.length;
};

// Calculate RMS
export const calculateRMS = (buffer) => {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
};