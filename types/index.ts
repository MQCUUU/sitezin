// types/index.ts

export interface Tag {
  id: string;
  name: string;
  description?: string;
  color?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface List {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}