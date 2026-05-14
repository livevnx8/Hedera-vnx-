
// Enhanced Agent Runner with Quantum Duet Integration
import { EnhancedSuperintelligence } from '../superintelligence/enhanced-superintelligence.js';
import { qvxQuantumDuetEngine } from '../superintelligence/qvx/QVXQuantumDuetEngine.js';

class EnhancedAgentRunner {
  constructor() {
    this.superintelligence = new EnhancedSuperintelligence();
    this.quantumEngine = qvxQuantumDuetEngine;
    this.performance = {
      responseTime: 0,
      accuracy: 0,
      efficiency: 0
    };
  }

  async runEnhancedAgent(query, context = {}) {
    const startTime = Date.now();
    
    try {
      // Process with quantum-enhanced superintelligence
      const response = await this.superintelligence.generateEnhancedResponse(query, {
        ...context,
        startTime
      });
      
      // Update performance metrics
      this.performance.responseTime = Date.now() - startTime;
      this.performance.accuracy = response.confidence;
      this.performance.efficiency = this.calculateEfficiency(response);
      
      return {
        ...response,
        performance: this.performance,
        enhanced: true,
        quantumPowered: true
      };
      
    } catch (error) {
      console.error('Enhanced agent error:', error);
      throw error;
    }
  }

  calculateEfficiency(response) {
    const processingTime = response.metadata.processingTime;
    const patternCount = response.metadata.patterns;
    const predictionCount = response.metadata.predictions;
    
    // Efficiency based on processing speed and intelligence depth
    const speedScore = Math.max(0, 1 - (processingTime / 1000)); // 1s = 0 efficiency
    const depthScore = Math.min(1, (patternCount + predictionCount) / 20); // 20 = full depth
    
    return (speedScore + depthScore) / 2;
  }

  async getPerformanceMetrics() {
    const quantumMetrics = this.quantumEngine.getCurrentQuantumMetrics();
    
    return {
      agent: this.performance,
      quantum: quantumMetrics,
      combined: {
        overallEfficiency: (this.performance.efficiency + (quantumMetrics?.duet_efficiency || 0)) / 2,
        processingSpeed: this.performance.responseTime,
        intelligenceDepth: this.performance.accuracy
      }
    };
  }
}

export default EnhancedAgentRunner;
