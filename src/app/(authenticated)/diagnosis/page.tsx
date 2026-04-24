'use client';

import { useState } from 'react';
import { Button } from '@/ui/primitives';

interface DiagnosisInput {
  businessName: string;
  businessType: string;
  problemStatement: string;
  mainIssue: string;
  monthlyRevenue?: number;
  monthlyCosts?: number;
  customerCount?: number;
}

interface DiagnosisResult {
  severity: string;
  primaryProblemCategory: string;
  diagnosticInterventionPhase: string;
  confidence: number;
  dataWarnings: string[];
  findings: string[];
  recommendations: string[];
  actionPlan: string[];
  executiveBrief: string;
}

export default function DiagnosisPage() {
  const [formData, setFormData] = useState<DiagnosisInput>({
    businessName: '',
    businessType: '',
    problemStatement: '',
    mainIssue: '',
  });

  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const numericFields = ['monthlyRevenue', 'monthlyCosts', 'customerCount'];
    const numValue = numericFields.includes(name) ? parseFloat(value) || undefined : value;
    setFormData((prev) => ({
      ...prev,
      [name]: numValue,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`Diagnosis failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Business Diagnosis</h1>
            <p className="mt-2 text-lg text-gray-600">
              Analyze your business health with rule-based diagnostic assessment
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Section */}
            <div className="lg:col-span-1">
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Assessment Input</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Business Name</label>
                    <input
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleInputChange}
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      placeholder="e.g., Acme Corp"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Business Type</label>
                    <select
                      name="businessType"
                      value={formData.businessType}
                      onChange={handleInputChange}
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                    >
                      <option value="">Select type...</option>
                      <option value="saas">SaaS</option>
                      <option value="ecommerce">E-commerce</option>
                      <option value="marketplace">Marketplace</option>
                      <option value="services">Services</option>
                      <option value="manufacturing">Manufacturing</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Main Issue</label>
                    <select
                      name="mainIssue"
                      value={formData.mainIssue}
                      onChange={handleInputChange}
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                    >
                      <option value="">Select issue...</option>
                      <option value="low_sales">Low Sales / Revenue</option>
                      <option value="high_costs">High Costs</option>
                      <option value="cash_flow">Cash Flow Problems</option>
                      <option value="customer_retention">Customer Retention</option>
                      <option value="operations">Operations Issues</option>
                      <option value="unclear">Unclear</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Problem Statement</label>
                    <textarea
                      name="problemStatement"
                      value={formData.problemStatement}
                      onChange={handleInputChange}
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      placeholder="Describe the problem in detail..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Monthly Revenue ($)</label>
                    <input
                      type="number"
                      name="monthlyRevenue"
                      value={formData.monthlyRevenue || ''}
                      onChange={handleInputChange}
                      min="0"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Monthly Costs ($)</label>
                    <input
                      type="number"
                      name="monthlyCosts"
                      value={formData.monthlyCosts || ''}
                      onChange={handleInputChange}
                      min="0"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Customer Count</label>
                    <input
                      type="number"
                      name="customerCount"
                      value={formData.customerCount || ''}
                      onChange={handleInputChange}
                      min="0"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      placeholder="0"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? 'Analyzing...' : 'Run Diagnosis'}
                  </Button>
                </form>
              </div>
            </div>

            {/* Results Section */}
            <div className="lg:col-span-2">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  <p className="font-semibold">Error</p>
                  <p>{error}</p>
                </div>
              )}

              {result && (
                <div className="space-y-6">
                  {/* Executive Brief */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">Executive Summary</h3>
                    <p className="text-blue-800">{result.executiveBrief}</p>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-600 font-medium">Severity</p>
                      <p className={`text-2xl font-bold mt-1 ${
                        result.severity === 'critical' ? 'text-red-600' :
                        result.severity === 'high' ? 'text-orange-600' :
                        result.severity === 'medium' ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {result.severity.toUpperCase()}
                      </p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-600 font-medium">Confidence</p>
                      <p className="text-2xl font-bold mt-1 text-gray-900">
                        {(result.confidence * 100).toFixed(0)}%
                      </p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-600 font-medium">Category</p>
                      <p className="text-lg font-bold mt-1 text-gray-900">
                        {result.primaryProblemCategory.replace(/_/g, ' ')}
                      </p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-600 font-medium">Intervention Phase</p>
                      <p className="text-lg font-bold mt-1 text-gray-900">
                        {result.diagnosticInterventionPhase}
                      </p>
                    </div>
                  </div>

                  {/* Findings */}
                  {result.findings.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Findings</h3>
                      <ul className="space-y-2">
                        {result.findings.map((finding, idx) => (
                          <li key={idx} className="flex items-start">
                            <span className="text-blue-600 mr-3">•</span>
                            <span className="text-gray-700">{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations */}
                  {result.recommendations.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommendations</h3>
                      <ul className="space-y-2">
                        {result.recommendations.map((rec, idx) => (
                          <li key={idx} className="flex items-start">
                            <span className="text-green-600 mr-3">✓</span>
                            <span className="text-gray-700">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Plan */}
                  {result.actionPlan.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Action Plan</h3>
                      <ol className="space-y-2">
                        {result.actionPlan.map((action, idx) => (
                          <li key={idx} className="text-gray-700">
                            <strong>{idx + 1}.</strong> {action}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Data Warnings */}
                  {result.dataWarnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-yellow-900 mb-2">Data Notes</h4>
                      <ul className="text-sm text-yellow-800 space-y-1">
                        {result.dataWarnings.map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!result && !error && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
                  <p className="text-gray-600">Fill in the form and click "Run Diagnosis" to analyze your business</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
