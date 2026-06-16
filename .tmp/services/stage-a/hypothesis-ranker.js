export class HypothesisRanker {
    rankHypotheses(hypotheses, allEvidence) {
        const ranked = hypotheses.map((h) => this.rankHypothesis(h, allEvidence));
        // Sort by confidence descending
        return ranked.sort((a, b) => b.confidence - a.confidence);
    }
    rankHypothesis(hypothesis, allEvidence) {
        // Calculate support and conflict scores based on evidence
        const supportScore = Math.min(10, (hypothesis.supportingEvidenceCount / Math.max(allEvidence.length, 1)) * 10);
        const conflictScore = Math.min(10, (hypothesis.conflictingEvidenceCount / Math.max(allEvidence.length, 1)) * 10);
        const netScore = supportScore - conflictScore;
        // Recalculate confidence based on net score and evidence
        const confidence = this.calculateConfidenceFromScore(netScore, hypothesis);
        const justification = this.generateJustification(hypothesis.supportingEvidenceCount, hypothesis.conflictingEvidenceCount, allEvidence.length, confidence);
        return {
            ...hypothesis,
            supportingScore: Math.round(supportScore * 10) / 10,
            conflictScore: Math.round(conflictScore * 10) / 10,
            netScore: Math.round(netScore * 10) / 10,
            confidence,
            confidenceJustification: justification,
        };
    }
    calculateConfidenceFromScore(netScore, hypothesis) {
        // Map net score to confidence (0-65 range)
        let confidence;
        if (netScore > 5) {
            confidence = 55; // 55-65
        }
        else if (netScore > 3) {
            confidence = 45; // 45-55
        }
        else if (netScore > 1) {
            confidence = 35; // 35-45
        }
        else if (netScore > -1) {
            confidence = 25; // 25-35 (unclear)
        }
        else {
            confidence = 15; // 15-25 (contradicted)
        }
        // Add variance based on supporting evidence count
        if (hypothesis.supportingEvidenceCount >= 4)
            confidence = Math.min(65, confidence + 5);
        if (hypothesis.supportingEvidenceCount >= 6)
            confidence = Math.min(65, confidence + 5);
        // Reduce if contradictions present
        if (hypothesis.conflictingEvidenceCount > 3)
            confidence = Math.max(10, confidence - 10);
        return Math.round(confidence);
    }
    generateJustification(supportingCount, conflictCount, totalEvidence, confidence) {
        return `Supporting: ${supportingCount} items, Conflicting: ${conflictCount} items, Total: ${totalEvidence}, Confidence = ${confidence}%`;
    }
}
