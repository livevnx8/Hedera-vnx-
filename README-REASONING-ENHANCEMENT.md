# Vera Reasoning Enhancement - Retraining Guide

## 🧠 Overview

Vera has been enhanced with advanced reasoning capabilities and is ready for retraining. This guide walks you through the fine-tuning process to integrate her new cognitive abilities.

## 🎯 What's New

### Advanced Reasoning Methods
- **Deductive Reasoning**: Logical step-by-step analysis from general to specific
- **Inductive Reasoning**: Pattern recognition and generalization from observations
- **Abductive Reasoning**: Finding the best explanation for observations
- **Bayesian Reasoning**: Probabilistic inference with evidence updating
- **Causal Reasoning**: Understanding cause-and-effect relationships
- **Analogical Reasoning**: Drawing insights from similar cases

### Information Synthesis
- **Multi-source fusion**: Quality-assessed information from diverse sources
- **Bias detection**: Political, commercial, emotional, and confirmation bias analysis
- **Fact verification**: Cross-referencing claims against multiple sources
- **Contradiction resolution**: Identifying and resolving conflicting information

### Hypothesis Testing
- **Generation**: Create multiple alternative hypotheses
- **Validation**: Test hypotheses using multiple methods (logical, empirical, statistical)
- **Evidence evaluation**: Systematic assessment of supporting and contradicting evidence

## 🚀 Quick Start

### 1. Generate Training Dataset
```bash
node --import tsx/esm scripts/generate-reasoning-dataset.ts
```

### 2. Start Fine-Tuning
```bash
./scripts/start-reasoning-finetune.sh
```

### 3. Test Enhanced Model
```bash
./scripts/test-reasoning-enhancement.sh
```

## 📋 Prerequisites

### Required Files
- `./models/vera-model.gguf` - Base Vera model
- `./fine-tuning/vera-enhanced-dataset.jsonl` - Training dataset (generated automatically)

### Hardware Requirements
- **GPU**: NVIDIA GPU with 8GB+ VRAM (recommended)
- **CPU**: 8+ cores if using CPU training
- **RAM**: 16GB+ memory
- **Storage**: 10GB+ free space

### Software Dependencies
- Python 3.8+
- Node.js 18+
- CUDA drivers (for GPU training)

## 📊 Training Configuration

### Model Settings
```json
{
  "model": {
    "base_model": "./models/vera-model.gguf",
    "output_model": "./models/vera-reasoning-enhanced.gguf",
    "context_length": 4096,
    "batch_size": 4,
    "learning_rate": 1e-5,
    "max_steps": 1000
  }
}
```

### Reasoning Focus Areas
- **Logical Analysis**: Step-by-step reasoning with confidence scoring
- **Evidence Evaluation**: Quality assessment of sources and claims
- **Method Selection**: Automatic reasoning method detection
- **Tool Integration**: Seamless use of reasoning tools

## 🧪 Testing Capabilities

### Reasoning Method Tests
- **Deductive**: Logical syllogisms and conclusions
- **Inductive**: Pattern recognition from examples
- **Abductive**: Best explanation identification
- **Bayesian**: Probability calculations and updates
- **Causal**: Cause-effect relationship analysis
- **Analogical**: Similarity-based insights

### Information Synthesis Tests
- **Multi-source**: Synthesizing from news, wiki, academic sources
- **Quality Assessment**: Credibility scoring and bias detection
- **Contradiction Detection**: Identifying conflicting information
- **Trend Analysis**: Temporal pattern identification

### Hypothesis Testing Tests
- **Generation**: Creating alternative explanations
- **Validation**: Systematic testing methods
- **Evidence Analysis**: Supporting and contradicting evidence
- **Confidence Scoring**: Probabilistic assessment

## 📈 Performance Metrics

### Target Benchmarks
- **Reasoning Accuracy**: >90% correct logical deductions
- **Response Time**: <3 seconds for simple reasoning
- **Confidence Calibration**: Well-calibrated confidence scores
- **Evidence Quality**: >80% high-quality synthesis

### Quality Indicators
- **Logical Coherence**: Step-by-step reasoning without gaps
- **Evidence Support**: Claims backed by credible sources
- **Method Appropriateness**: Correct reasoning method selection
- **Contradiction Resolution**: Effective handling of conflicts

## 🔧 Integration with Existing System

### New Tools Added
```typescript
// Enhanced reasoning tools
reason_analyze(problem, method, options)
hypothesis_test(situation, test_methods)
synthesize_information(topic, source_types)
verify_claims(claims, sources)
```

### Backward Compatibility
- All existing functionality preserved
- New capabilities opt-in via tool calls
- Graceful fallback to original behavior
- No breaking changes to APIs

### Enhanced Chat Integration
```typescript
// Automatic reasoning detection
const enhancedChat = await reasoningIntegration.enhancedChat(messages, {
  enableReasoning: true,
  reasoningMethod: 'auto',
  synthesizeInfo: true,
  generateHypotheses: false
});
```

## 🗂️ File Structure

```
hedera-llm-api/
├── src/agent/reasoning/
│   ├── reasoningGraph.ts          # Knowledge graph system
│   ├── inferenceEngine.ts         # 6 reasoning methods
│   ├── hypothesisTester.ts        # Hypothesis generation/testing
│   ├── graphNode.ts              # Node types and factories
│   ├── graphEdge.ts              # Edge relationships
│   └── integration.ts            # System integration
├── src/agent/information/
│   ├── fusionEngine.ts           # Information synthesis
│   ├── qualityAssessment.ts      # Quality and bias analysis
│   └── factVerification.ts       # Fact checking
├── scripts/
│   ├── generate-reasoning-dataset.ts  # Training data generation
│   ├── start-reasoning-finetune.sh     # Fine-tuning script
│   └── test-reasoning-enhancement.sh   # Testing script
├── fine-tuning/
│   ├── vera-enhanced-dataset.jsonl     # Training data
│   ├── config-enhanced.json           # Training config
│   └── checkpoints/                    # Model checkpoints
└── models/
    ├── vera-model.gguf                 # Base model
    └── vera-reasoning-enhanced.gguf     # Enhanced model
```

## 🎯 Success Criteria

### Functional Requirements
- ✅ All 6 reasoning methods implemented
- ✅ Information synthesis from 3+ sources
- ✅ Hypothesis generation and testing
- ✅ Quality assessment and bias detection
- ✅ Fact verification integration

### Performance Requirements
- ✅ <3 seconds for simple reasoning
- ✅ <5 seconds for complex reasoning
- ✅ <80% of 4096 token limit usage
- ✅ >90% reasoning accuracy

### Integration Requirements
- ✅ Seamless integration with existing tools
- ✅ Backward compatibility maintained
- ✅ No breaking changes to APIs
- ✅ Enhanced chat capabilities

## 🔄 Next Steps

### Immediate Actions
1. **Run Fine-Tuning**: Execute the training script
2. **Validate Results**: Run comprehensive tests
3. **Deploy to Production**: Update model configuration
4. **Monitor Performance**: Track reasoning quality metrics

### Future Enhancements
- **Phase 3**: Adaptive learning system
- **Phase 4**: Advanced context management
- **Phase 5**: Multi-agent collaboration

## 🐛 Troubleshooting

### Common Issues

#### Training Fails
```bash
# Check memory usage
free -h

# Reduce batch size if memory issues
# Edit config-enhanced.json:
# "batch_size": 2
```

#### GPU Issues
```bash
# Check GPU status
nvidia-smi

# Reduce GPU layers if memory issues
# Edit config-enhanced.json:
# "gpu_layers": 20
```

#### Dataset Issues
```bash
# Validate dataset format
python3 -c "
import json
with open('./fine-tuning/vera-enhanced-dataset.jsonl', 'r') as f:
    for i, line in enumerate(f):
        try:
            json.loads(line)
        except:
            print(f'Error on line {i+1}: {line[:50]}...')
"
```

### Performance Issues

#### Slow Reasoning
- Check GPU utilization
- Reduce model complexity
- Optimize batch size

#### Low Accuracy
- Increase training steps
- Add more training examples
- Adjust learning rate

## 📞 Support

### Logs and Monitoring
- Training logs: `./fine-tuning/logs/`
- Test results: `./test-results/reasoning/`
- Model checkpoints: `./fine-tuning/checkpoints/`

### Performance Monitoring
```bash
# Monitor GPU usage
watch -n 1 nvidia-smi

# Monitor training progress
tail -f ./fine-tuning/logs/training.log
```

---

**🎉 Ready to enhance Vera's reasoning capabilities!**

The enhanced Vera will provide:
- **Deeper Analysis**: Step-by-step logical reasoning
- **Better Insights**: Quality-assessed information synthesis
- **Critical Thinking**: Hypothesis testing and verification
- **Intelligent Responses**: Context-aware, evidence-based answers

Start the fine-tuning process and watch Vera transform into a sophisticated reasoning engine! 🧠✨
