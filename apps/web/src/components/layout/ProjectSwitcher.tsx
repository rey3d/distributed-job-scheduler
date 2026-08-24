import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Project } from '../../api/types';
import { Folder, ChevronDown, Check, Plus } from 'lucide-react';

interface ProjectSwitcherProps {
  onOpenCreateProject?: () => void;
}

export const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({ onOpenCreateProject }) => {
  const { organization, project: currentProject, setProject } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const orgId = organization?.id || '';

  const loadProjects = async () => {
    if (!orgId) return;
    try {
      const res = await api.getProjectsForOrg(orgId);
      const projList = Array.isArray(res) ? res : res.data || [];
      setProjects(projList);
    } catch (err) {
      console.error('Failed to load projects for switcher:', err);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [orgId, currentProject?.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProject = (proj: Project) => {
    setProject(proj);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Switcher Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:border-[#4F6EF7]/50 hover:bg-white/[0.08] transition-all text-xs font-mono text-gray-200"
      >
        <Folder className="w-3.5 h-3.5 text-[#4F6EF7]" />
        <span className="font-semibold text-white tracking-tight">
          {currentProject?.name || 'Production Core'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-[#141414] border border-white/10 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-mono text-gray-500 uppercase tracking-wider">
            Switch Project Workspace
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1">
            {projects.map((p) => {
              const isSelected = currentProject?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectProject(p)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition-colors ${
                    isSelected
                      ? 'bg-[#4F6EF7]/10 text-[#4F6EF7] font-bold border border-[#4F6EF7]/20'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#4F6EF7]' : 'text-gray-500'}`} />
                    <span className="truncate">{p.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#4F6EF7] shrink-0" />}
                </button>
              );
            })}
          </div>

          {onOpenCreateProject && (
            <div className="pt-1 border-t border-white/10">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenCreateProject();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono font-bold text-[#4F6EF7] hover:bg-[#4F6EF7]/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New Project
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
