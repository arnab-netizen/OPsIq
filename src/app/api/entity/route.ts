import { NextRequest, NextResponse } from "next/server";
import { createEntity, getEntities } from "@/services/entity/store";
import { randomUUID } from "crypto";

export async function GET() {
  try {
    const entities = getEntities();
    return NextResponse.json(entities);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "Missing required fields: name, type" },
        { status: 400 }
      );
    }

    const validTypes = ["business_unit", "client", "project"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid type: must be business_unit, client, or project" },
        { status: 400 }
      );
    }

    const entity = {
      id: randomUUID(),
      name,
      type,
      createdAt: new Date().toISOString(),
    };

    createEntity(entity);

    return NextResponse.json(entity);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
