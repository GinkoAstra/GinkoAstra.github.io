import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    category: z.enum(["project", "tech", "math"]),
    tags: z.array(z.string()).default([]),
    summary: z.string(),
    reading: z.string().optional(),
  }),
});

export const collections = { posts };
