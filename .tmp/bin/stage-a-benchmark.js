#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { EvidenceSynthesisEngine } from "../services/stage-a/evidence-synthesis-engine.js";
import { SymptomSeparator } from "../services/stage-a/symptom-separator.js";
import { HypothesisGenerator } from "../services/stage-a/hypothesis-generator.js";
import { HypothesisRanker } from "../services/stage-a/hypothesis-ranker.js";
import { EvidenceMapper } from "../services/stage-a/evidence-mapper.js";
async function selectBenchmarkCases() {
    // Select 20 representative cases from Round 2
    // Must include: all 5 BLND, 3-4 ADV, mix of RW/PD/SYN
    const cases = [
        // All 5 BLND cases (mandatory)
        "BLND-006",
        "BLND-007",
        "BLND-008",
        "BLND-009",
        "BLND-010",
        // 3-4 ADV cases (hardest)
        "ADV-011",
        "ADV-012",
        "ADV-013",
        "ADV-014",
        // Mix of RW cases
        "RW-016",
        "RW-018",
        "RW-020",
        "RW-022",
        "RW-024",
        // Mix of PD cases
        "PD-011",
        "PD-013",
        "PD-015",
        "PD-017",
        "PD-019",
        // Mix of SYN cases
        "SYN-011",
        "SYN-013",
    ];
    return cases;
}
function loadCaseInput(caseId) {
    try {
        const caseDir = path.join(process.cwd(), `simulation_runs/round_002/cases/${caseId}`);
        const inputPath = path.join(caseDir, "01_case_input.json");
        if (!fs.existsSync(inputPath)) {
            console.error(`Case input not found: ${inputPath}`);
            return null;
        }
        const data = fs.readFileSync(inputPath, "utf-8");
        const caseData = JSON.parse(data);
        return {
            caseId,
            evidence: caseData.evidence || [],
        };
    }
    catch (error) {
        console.error(`Error loading case ${caseId}:`, error);
        return null;
    }
}
function executeStagA(caseInput) {
    const synthesisEngine = new EvidenceSynthesisEngine();
    const separator = new SymptomSeparator();
    const generator = new HypothesisGenerator();
    const ranker = new HypothesisRanker();
    const mapper = new EvidenceMapper();
    // Step 1: Synthesize evidence
    const synthesized = synthesisEngine.synthesizeEvidence(caseInput.evidence);
    // Step 2: Generate hypotheses
    const hypotheses = generator.generateHypotheses(synthesized, caseInput.evidence);
    // Step 3: Rank hypotheses
    const ranked = ranker.rankHypotheses(hypotheses, caseInput.evidence);
    // Step 4: Map evidence for top hypothesis
    const mappings = ranked.map((h) => mapper.mapEvidence(h.rootCause, caseInput.evidence));
    return {
        caseId: caseInput.caseId,
        synthesizedEvidence: synthesized,
        hypotheses,
        rankedHypotheses: ranked,
        mappings,
        evidenceTraceRate: synthesized.evidenceTraceRate,
        topHypothesis: ranked.length > 0 ? ranked[0].rootCause : "UNKNOWN",
        topConfidence: ranked.length > 0 ? ranked[0].confidence : 0,
    };
}
async function runBenchmark() {
    console.log("=== STAGE A BENCHMARK EXECUTION ===\n");
    const caseIds = await selectBenchmarkCases();
    console.log(`Selected ${caseIds.length} benchmark cases\n`);
    const outputs = [];
    const outputDir = path.join(process.cwd(), "simulation_runs/round_002/stage_a_outputs");
    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    let successCount = 0;
    let failureCount = 0;
    for (const caseId of caseIds) {
        process.stdout.write(`Executing ${caseId}... `);
        const caseInput = loadCaseInput(caseId);
        if (!caseInput) {
            console.log("SKIPPED (input not found)");
            failureCount++;
            continue;
        }
        try {
            const output = executeStagA(caseInput);
            outputs.push(output);
            // Write frozen output
            const outputPath = path.join(outputDir, `${caseId}_stage_a_output.json`);
            fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
            console.log(`OK (confidence: ${output.topConfidence}%)`);
            successCount++;
        }
        catch (error) {
            console.log(`ERROR: ${error}`);
            failureCount++;
        }
    }
    console.log(`\n=== RESULTS ===`);
    console.log(`Executed: ${successCount}/${caseIds.length}`);
    console.log(`Failed: ${failureCount}/${caseIds.length}`);
    // Calculate aggregate metrics
    if (outputs.length > 0) {
        const avgTraceRate = Math.round(outputs.reduce((sum, o) => sum + o.evidenceTraceRate, 0) / outputs.length);
        const avgConfidence = Math.round(outputs.reduce((sum, o) => sum + o.topConfidence, 0) / outputs.length);
        const maxConfidence = Math.max(...outputs.map((o) => o.topConfidence));
        const minConfidence = Math.min(...outputs.map((o) => o.topConfidence));
        console.log(`\nMetrics:`);
        console.log(`  Average Evidence Trace Rate: ${avgTraceRate}%`);
        console.log(`  Average Top Hypothesis Confidence: ${avgConfidence}%`);
        console.log(`  Max Confidence: ${maxConfidence}%`);
        console.log(`  Min Confidence: ${minConfidence}%`);
        // Write summary
        const summaryPath = path.join(outputDir, "stage_a_benchmark_results.json");
        fs.writeFileSync(summaryPath, JSON.stringify({
            caseCount: outputs.length,
            avgTraceRate,
            avgConfidence,
            maxConfidence,
            minConfidence,
            outputs: outputs.map((o) => ({
                caseId: o.caseId,
                traceRate: o.evidenceTraceRate,
                topHypothesis: o.topHypothesis,
                confidence: o.topConfidence,
            })),
        }, null, 2));
        console.log(`\nOutputs written to: ${outputDir}`);
    }
}
runBenchmark().catch(console.error);
