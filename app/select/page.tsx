"use client";

import { useEffect, useState } from "react";

type ServiceType = {
  id: string;
  name: string;
};

type Plan = {
  id: string;
  title: string;
};

export default function SelectPage() {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedServiceType, setSelectedServiceType] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");

  useEffect(() => {
    fetch("/api/service-types")
      .then((r) => r.json())
      .then((data) => setServiceTypes(data.serviceTypes || []));
  }, []);

  useEffect(() => {
    if (!selectedServiceType) return;

    fetch(`/api/plans?serviceTypeId=${selectedServiceType}`)
      .then((r) => r.json())
      .then((data) => setPlans(data.plans || []));
  }, [selectedServiceType]);

  return (
    <main className="min-h-screen bg-black text-white p-10">
      <h1 className="text-5xl font-black text-center uppercase mb-10 text-[#7bbc07]">
        Select Service
      </h1>

      <div className="w-full max-w-[1920px] mx-auto">
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block mb-2 text-xl text-center">
              Service Type
            </label>

            <select
              className="w-full p-4 rounded bg-neutral-800 text-white border border-gray-600"
              value={selectedServiceType}
              onChange={(e) => {
                setSelectedServiceType(e.target.value);
                setSelectedPlan("");
              }}
            >
              <option value="">Select Service Type</option>

              {serviceTypes.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-2 text-xl text-center">Plan</label>

            <select
              className="w-full p-4 rounded bg-neutral-800 text-white border border-gray-600"
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
            >
              <option value="">Select Plan</option>

              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedServiceType && selectedPlan && (
          <iframe
			  src={`/manual-board?serviceTypeId=${selectedServiceType}&planId=${selectedPlan}`}
			  className="w-full h-[1080px] border border-gray-700 rounded-xl"
			/>
        )}
      </div>
    </main>
  );
}