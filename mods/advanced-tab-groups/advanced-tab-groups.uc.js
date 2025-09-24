// ==UserScript==
// @name           Advanced Tab Groups
// @ignorecache
// ==/UserScript==
/* ==== Tab groups ==== */
/* https://github.com/Anoms12/Advanced-Tab-Groups */
/* ====== v3.2.1b ====== */

class AdvancedTabGroups {
  constructor() {
    this.init();
  }

  init() {
    console.log("[AdvancedTabGroups] Initializing...");

    // Clear any stored color picker data to prevent persistence issues
    this.clearStoredColorData();

    // Load saved tab group colors
    this.loadSavedColors();

    // Load saved tab group icons
    this.loadGroupIcons();

    this.setupStash();

    // Set up observer for all tab groups
    this.setupObserver();

    // Add folder context menu item
    this.addFolderContextMenuItems();

    // Remove built-in tab group editor menus if they exist
    this.removeBuiltinTabGroupMenu();

    // Process existing groups
    this.processExistingGroups();

    // Also try again after a delay to catch any missed groups
    setTimeout(() => this.processExistingGroups(), 1000);

    // Set up periodic saving of colors (every 30 seconds)
    setInterval(() => {
      this.saveTabGroupColors();
    }, 30000);

    // Listen for tab group creation events from the platform component
    document.addEventListener(
      "TabGroupCreate",
      this.onTabGroupCreate.bind(this)
    );
  }

  setupObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Proactively remove Firefox built-in tab group editor menu if it appears
              if (
                node.id === "tab-group-editor" ||
                node.nodeName?.toLowerCase() === "tabgroup-meu" ||
                node.querySelector?.("#tab-group-editor, tabgroup-meu")
              ) {
                this.removeBuiltinTabGroupMenu(node);
              }
              // Check if the added node is a tab-group
              if (node.tagName === "tab-group") {
                // Skip split-view-groups
                if (!node.hasAttribute("split-view-group")) {
                  this.processGroup(node);
                }
              }
              // Check if any children are tab-groups
              const childGroups = node.querySelectorAll?.("tab-group") || [];
              childGroups.forEach((group) => {
                // Skip split-view-groups
                if (!group.hasAttribute("split-view-group")) {
                  this.processGroup(group);
                }
              });
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log("[AdvancedTabGroups] Observer set up");
  }

  // Remove Firefox's built-in tab group editor menu elements if present
  removeBuiltinTabGroupMenu(root = document) {
    try {
      const list = root.querySelectorAll
        ? root.querySelectorAll("#tab-group-editor, tabgroup-meu")
        : [];
      list.forEach((el) => {
        console.log(
          "[AdvancedTabGroups] Removing built-in tab group menu:",
          el.id || el.nodeName
        );
        el.remove();
      });
      // Fallback direct id lookup
      const byId = root.getElementById
        ? root.getElementById("tab-group-editor")
        : null;
      if (byId) {
        console.log(
          "[AdvancedTabGroups] Removing built-in tab group menu by id fallback"
        );
        byId.remove();
      }
    } catch (e) {
      console.error(
        "[AdvancedTabGroups] Error removing built-in tab group menu:",
        e
      );
    }
  }

  processExistingGroups() {
    const groups = document.querySelectorAll("tab-group");
    console.log(
      "[AdvancedTabGroups] Processing existing groups:",
      groups.length
    );

    groups.forEach((group) => {
      // Skip split-view-groups
      if (!group.hasAttribute("split-view-group")) {
        this.processGroup(group);
      }
    });
  }

  // Track currently edited group for rename
  _editingGroup = null;
  _groupEdited = null;

  renameGroupKeydown(event) {
    event.stopPropagation();
    if (event.key === "Enter") {
      let label = this._groupEdited;
      let input = document.getElementById("tab-label-input");
      let newName = input.value.trim();
      document.documentElement.removeAttribute("zen-renaming-group");
      input.remove();
      if (label && newName) {
        const group = label.closest("tab-group");
        if (group && newName !== group.label) {
          group.label = newName;
        }
      }
      label.classList.remove("tab-group-label-editing");
      label.style.display = "";
      this._groupEdited = null;
    } else if (event.key === "Escape") {
      event.target.blur();
    }
  }

  renameGroupStart(group, selectAll = true) {
    if (this._groupEdited) return;
    const labelElement = group.querySelector(".tab-group-label");
    if (!labelElement) return;
    this._groupEdited = labelElement;
    document.documentElement.setAttribute("zen-renaming-group", "true");
    labelElement.classList.add("tab-group-label-editing");
    labelElement.style.display = "none";
    const input = document.createElement("input");
    input.id = "tab-label-input";
    input.className = "tab-group-label";
    input.type = "text";
    input.value = group.label || labelElement.textContent || "";
    input.setAttribute("autocomplete", "off");
    input.style.caretColor = "auto";
    labelElement.after(input);
    // Focus after insertion
    input.focus();
    if (selectAll) {
      // Select all text for manual rename
      input.select();
    } else {
      // Place cursor at end for auto-rename on new groups
      try {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      } catch (_) {}
    }
    input.addEventListener("keydown", this.renameGroupKeydown.bind(this));
    input.addEventListener("blur", this.renameGroupHalt.bind(this));
  }

  renameGroupHalt(event) {
    if (document.activeElement === event.target || !this._groupEdited) {
      return;
    }
    document.documentElement.removeAttribute("zen-renaming-group");
    let input = document.getElementById("tab-label-input");
    if (input) input.remove();
    this._groupEdited.classList.remove("tab-group-label-editing");
    this._groupEdited.style.display = "";
    this._groupEdited = null;
  }

  processGroup(group) {
    // Skip if already processed, if it's a folder, or if it's a split-view-group
    if (
      group.hasAttribute("data-close-button-added") ||
      group.classList.contains("zen-folder") ||
      group.hasAttribute("zen-folder") ||
      group.hasAttribute("split-view-group")
    ) {
      return;
    }

    console.log("[AdvancedTabGroups] Processing group:", group.id);

    const labelContainer = group.querySelector(".tab-group-label-container");
    if (!labelContainer) {
      console.log(
        "[AdvancedTabGroups] No label container found for group:",
        group.id
      );
      return;
    }

    // Check if close button already exists
    if (labelContainer.querySelector(".tab-close-button")) {
      console.log(
        "[AdvancedTabGroups] Close button already exists for group:",
        group.id
      );
      return;
    }

    // Create and inject the icon container and close button together for readability
    const groupDomFrag = window.MozXULElement.parseXULToFragment(`
      <div class="tab-group-icon-container">
        <div class="tab-group-icon"></div>
        <image class="group-marker" role="button" keyNav="false" tooltiptext="Toggle Group"/>
      </div>
      <image class="group-stash-button stash-icon" role="button" keyNav="false" tooltiptext="Stash Group"/>
      <image class="tab-close-button close-icon" role="button" keyNav="false" tooltiptext="Close Group"/>
    `);
    const iconContainer = groupDomFrag.children[0];
    const stashButton = groupDomFrag.children[1];
    const closeButton = groupDomFrag.children[2];

    // Insert the icon container at the beginning of the label container
    labelContainer.insertBefore(iconContainer, labelContainer.firstChild);
    // Add the stash button to the label container
    labelContainer.appendChild(stashButton);
    // Add the close button to the label container
    labelContainer.appendChild(closeButton);

    console.log(
      "[AdvancedTabGroups] Icon container and close button injected for group:",
      group.id
    );

    // Add click event listener
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      console.log(
        "[AdvancedTabGroups] Close button clicked for group:",
        group.id
      );

      try {
        // Remove the group's saved color and icon before removing the group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);

        gBrowser.removeTabGroup(group);
        console.log(
          "[AdvancedTabGroups] Successfully removed tab group:",
          group.id
        );
      } catch (error) {
        console.error("[AdvancedTabGroups] Error removing tab group:", error);
      }
    });

    // Remove editor mode class if present (prevent editor mode on new group)
    group.classList.remove("tab-group-editor-mode-create");

    // If the group is new (no label or default label), start renaming and set color
    if (
      !group.label ||
      group.label === "" ||
      ("defaultGroupName" in group && group.label === group.defaultGroupName)
    ) {
      // Start renaming
      this.renameGroupStart(group, false); // Don't select all for new groups
      // Set color to average favicon color
      if (typeof group._useFaviconColor === "function") {
        group._useFaviconColor();
      }
    }

    // Add context menu to the group
    this.addContextMenu(group);

    console.log(
      "[AdvancedTabGroups] Close button, rename functionality, and context menu added to group:",
      group.id
    );
  }

  // Ensure a single, shared context menu exists and is wired up
  ensureSharedContextMenu() {
    if (this._sharedContextMenu) return this._sharedContextMenu;

    const contextMenuFrag = window.MozXULElement.parseXULToFragment(`
      <menupopup id="advanced-tab-groups-context-menu">
        <menu class="change-group-color" label="Change Group Color">
          <menupopup>
            <menuitem class="set-group-color" 
                      label="Set Group Color"/>
            <menuitem class="use-favicon-color" 
                      label="Use Average Favicon Color"/>
          </menupopup>
        </menu>
        <menuitem class="rename-group" label="Rename Group"/>
        <menuitem class="change-group-icon" label="Change Group Icon"/>
        <menuseparator/>
        <menuitem class="ungroup-tabs" label="Ungroup Tabs"/>
        <menuitem class="convert-group-to-folder" 
                  label="Convert Group to Folder"/>
      </menupopup>
    `);

    const contextMenu = contextMenuFrag.firstElementChild;
    document.body.appendChild(contextMenu);

    // Track which group is targeted while the popup is open
    this._contextMenuCurrentGroup = null;

    const setGroupColorItem = contextMenu.querySelector(".set-group-color");
    const useFaviconColorItem = contextMenu.querySelector(".use-favicon-color");
    const renameGroupItem = contextMenu.querySelector(".rename-group");
    const changeGroupIconItem = contextMenu.querySelector(".change-group-icon");
    const ungroupTabsItem = contextMenu.querySelector(".ungroup-tabs");
    const convertToFolderItem = contextMenu.querySelector(
      ".convert-group-to-folder"
    );

    if (setGroupColorItem) {
      setGroupColorItem.addEventListener("command", () => {
        const group = this._contextMenuCurrentGroup;
        if (group && typeof group._setGroupColor === "function") {
          group._setGroupColor();
        }
      });
    }

    if (useFaviconColorItem) {
      useFaviconColorItem.addEventListener("command", () => {
        const group = this._contextMenuCurrentGroup;
        if (group && typeof group._useFaviconColor === "function") {
          group._useFaviconColor();
        }
      });
    }

    if (renameGroupItem) {
      renameGroupItem.addEventListener("command", () => {
        const group = this._contextMenuCurrentGroup;
        if (group) this.renameGroupStart(group);
      });
    }

    if (changeGroupIconItem) {
      changeGroupIconItem.addEventListener("command", () => {
        const group = this._contextMenuCurrentGroup;
        if (group) this.changeGroupIcon(group);
      });
    }

    if (ungroupTabsItem) {
      ungroupTabsItem.addEventListener("command", () => {
        const group = this._contextMenuCurrentGroup;
        if (group && typeof group.ungroupTabs === "function") {
          try {
            group.ungroupTabs();
          } catch (error) {
            console.error("[AdvancedTabGroups] Error ungrouping tabs:", error);
          }
        }
      });
    }

    if (convertToFolderItem) {
      convertToFolderItem.addEventListener("command", () => {
        const group = this._contextMenuCurrentGroup;
        if (group) this.convertGroupToFolder(group);
      });
    }

    // Clear the current group when the menu closes (ready to be reused)
    contextMenu.addEventListener("popuphidden", () => {
      this._contextMenuCurrentGroup = null;
    });

    this._sharedContextMenu = contextMenu;
    return this._sharedContextMenu;
  }

  addFolderContextMenuItems() {
    // Use a timeout to ensure the menu exists, as it's created by another component
    setTimeout(() => {
      const folderMenu = document.getElementById("zenFolderActions");
      if (!folderMenu || folderMenu.querySelector("#convert-folder-to-group")) {
        return; // Already exists or menu not found
      }

      const menuFragment = window.MozXULElement.parseXULToFragment(`
        <menuitem id="convert-folder-to-group" label="Convert Folder to Group"/>
      `);

      const convertToSpaceItem = folderMenu.querySelector(
        "#context_zenFolderToSpace"
      );
      if (convertToSpaceItem) {
        convertToSpaceItem.after(menuFragment);
      } else {
        // Fallback if the reference item isn't found
        folderMenu.appendChild(menuFragment);
      }

      folderMenu.addEventListener("command", (event) => {
        if (event.target.id === "convert-folder-to-group") {
          const triggerNode = folderMenu.triggerNode;
          if (!triggerNode) {
            console.error(
              "[AdvancedTabGroups] Could not find trigger node for folder context menu."
            );
            return;
          }
          const folder = triggerNode.closest("zen-folder");
          if (folder) {
            this.convertFolderToGroup(folder);
          } else {
            console.error(
              "[AdvancedTabGroups] Could not find folder from trigger node:",
              triggerNode
            );
          }
        }
      });
      console.log(
        "[AdvancedTabGroups] Added 'Convert Folder to Group' to context menu."
      );
    }, 1500);
  }

  // Handle platform-dispatched creation event for groups
  onTabGroupCreate(event) {
    try {
      const target = event.target;
      const group = target?.closest
        ? target.closest("tab-group") ||
          (target.tagName === "tab-group" ? target : null)
        : null;
      if (!group) return;

      // Skip split-view-groups
      if (group.hasAttribute("split-view-group")) {
        return;
      }

      // Remove built-in menu that may be created alongside new groups
      this.removeBuiltinTabGroupMenu();

      // Ensure group gets processed (buttons/context menu) if not already
      if (!group.hasAttribute("data-close-button-added")) {
        this.processGroup(group);
      }

      // Auto-start rename and apply favicon color when newly created
      if (
        !group.label ||
        group.label === "" ||
        ("defaultGroupName" in group && group.label === group.defaultGroupName)
      ) {
        if (!this._groupEdited) {
          this.renameGroupStart(group, false); // Don't select all for new groups
        }
        if (typeof group._useFaviconColor === "function") {
          setTimeout(() => group._useFaviconColor(), 300);
        }
      }
    } catch (e) {
      console.error("[AdvancedTabGroups] Error handling TabGroupCreate:", e);
    }
  }

  addContextMenu(group) {
    // Prevent duplicate listener wiring per group
    if (group._contextMenuAdded) return;
    group._contextMenuAdded = true;

    // Create shared menu once
    const sharedMenu = this.ensureSharedContextMenu();

    // Attach context menu only to the label container
    const labelContainer = group.querySelector(".tab-group-label-container");
    if (labelContainer) {
      // Strip default context attribute to prevent built-in menu
      labelContainer.removeAttribute("context");
      labelContainer.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._contextMenuCurrentGroup = group;
        sharedMenu.openPopupAtScreen(event.screenX, event.screenY, false);
      });
    }

    // Also strip any context attribute from the group itself
    group.removeAttribute("context");

    // Add methods to the group for context menu actions (used by commands)
    group._renameGroupFromContextMenu = () => {
      this.renameGroupStart(group);
    };

    group._closeGroupFromContextMenu = () => {
      try {
        // Remove the group's saved color and icon before removing the group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);

        gBrowser.removeTabGroup(group);
        console.log(
          "[AdvancedTabGroups] Group closed via context menu:",
          group.id
        );
      } catch (error) {
        console.error(
          "[AdvancedTabGroups] Error closing group via context menu:",
          error
        );
      }
    };

    group._collapseGroupFromContextMenu = () => {
      if (group.hasAttribute("collapsed")) {
        group.removeAttribute("collapsed");
        console.log(
          "[AdvancedTabGroups] Group expanded via context menu:",
          group.id
        );
      } else {
        group.setAttribute("collapsed", "true");
        console.log(
          "[AdvancedTabGroups] Group collapsed via context menu:",
          group.id
        );
      }
    };

    group._expandGroupFromContextMenu = () => {
      group.removeAttribute("collapsed");
      console.log(
        "[AdvancedTabGroups] Group expanded via context menu:",
        group.id
      );
    };

    group._setGroupColor = () => {
      console.log(
        "[AdvancedTabGroups] Set Group Color clicked for group:",
        group.id
      );

      // Check if the gradient picker is available
      if (window.nsZenThemePicker && window.gZenThemePicker) {
        // Store reference to current group for color application
        window.gZenThemePicker._currentTabGroup = group;

        // Try to find and click an existing button that opens the gradient picker
        try {
          // Look for the existing button that opens the gradient picker
          const existingButton = document.getElementById(
            "zenToolbarThemePicker"
          );
          if (existingButton) {
            console.log(
              "[AdvancedTabGroups] Found existing gradient picker button, clicking it"
            );

            // Store the current group reference in multiple places to ensure persistence
            window.gZenThemePicker._currentTabGroup = group;
            window.gZenThemePicker._tabGroupForColorPicker = group; // Backup reference

            // Store original methods for restoration
            const originalUpdateMethod =
              window.gZenThemePicker.updateCurrentWorkspace;
            const originalOnWorkspaceChange =
              window.gZenThemePicker.onWorkspaceChange;
            const originalGetGradient = window.gZenThemePicker.getGradient;

            // Capture AdvancedTabGroups instance for callbacks inside overrides
            const atg = this;

            // Override the updateCurrentWorkspace method to prevent browser background changes
            window.gZenThemePicker.updateCurrentWorkspace = async function (
              skipSave = true
            ) {
              // Check both references to ensure we don't lose the tab group
              const currentTabGroup =
                this._currentTabGroup || this._tabGroupForColorPicker;
              console.log(
                "[AdvancedTabGroups] updateCurrentWorkspace called, currentTabGroup:",
                currentTabGroup
              );

              // Only block browser changes if we're setting tab group colors
              if (currentTabGroup) {
                console.log(
                  "[AdvancedTabGroups] Blocking browser background change, applying to tab group instead"
                );
                // Don't call the original method - this prevents browser background changes
                // Instead, just apply the color to our tab group
                try {
                  // Get the current dots and their colors
                  const dots = this.panel.querySelectorAll(
                    ".zen-theme-picker-dot"
                  );
                  const colors = Array.from(dots)
                    .map((dot) => {
                      if (!dot || !dot.style) {
                        return null;
                      }

                      const colorValue = dot.style.getPropertyValue(
                        "--zen-theme-picker-dot-color"
                      );
                      if (!colorValue || colorValue === "undefined") {
                        return null;
                      }

                      const isPrimary = dot.classList.contains("primary");
                      const type = dot.getAttribute("data-type");

                      // Handle both RGB and hex colors
                      let rgb;
                      if (colorValue.startsWith("rgb")) {
                        rgb = colorValue.match(/\d+/g)?.map(Number) || [
                          0, 0, 0,
                        ];
                      } else if (colorValue.startsWith("#")) {
                        // Convert hex to RGB
                        const hex = colorValue.replace("#", "");
                        rgb = [
                          parseInt(hex.substr(0, 2), 16),
                          parseInt(hex.substr(2, 2), 16),
                          parseInt(hex.substr(4, 2), 16),
                        ];
                      } else {
                        rgb = [0, 0, 0];
                      }

                      return {
                        c: rgb,
                        isPrimary: isPrimary,
                        type: type,
                      };
                    })
                    .filter(Boolean);

                  if (colors.length > 0) {
                    const gradient = this.getGradient(colors);
                    console.log(
                      "[AdvancedTabGroups] Generated gradient:",
                      gradient,
                      "from colors:",
                      colors
                    );

                    // Set the --tab-group-color CSS variable on the group
                    currentTabGroup.style.setProperty(
                      "--tab-group-color",
                      gradient
                    );

                    // For simplicity, set the inverted color to the same value
                    // This simplifies the UI while maintaining the variable structure
                    currentTabGroup.style.setProperty(
                      "--tab-group-color-invert",
                      gradient
                    );

                    console.log(
                      "[AdvancedTabGroups] Applied color to group:",
                      currentTabGroup.id,
                      "Color:",
                      gradient
                    );

                    // Save the color to persistent storage (use plugin instance, not theme picker)
                    atg.saveTabGroupColors();
                  }
                } catch (error) {
                  console.error(
                    "[AdvancedTabGroups] Error applying color to group:",
                    error
                  );
                }

                // Don't call the original method - this prevents browser background changes
                return;
              } else {
                console.log(
                  "[AdvancedTabGroups] No tab group selected, allowing normal browser background changes"
                );
                // If no tab group is selected, allow normal browser background changes
                return await originalUpdateMethod.call(this, skipSave);
              }
            };

            // Also override the onWorkspaceChange method to prevent browser theme changes
            window.gZenThemePicker.onWorkspaceChange = async function (
              workspace,
              skipUpdate = false,
              theme = null
            ) {
              // Check both references to ensure we don't lose the tab group
              const currentTabGroup =
                this._currentTabGroup || this._tabGroupForColorPicker;
              console.log(
                "[AdvancedTabGroups] onWorkspaceChange called, currentTabGroup:",
                currentTabGroup
              );

              // Only block browser theme changes if we're setting tab group colors
              if (currentTabGroup) {
                console.log(
                  "[AdvancedTabGroups] Blocking browser theme change"
                );
                // Don't call the original method - this prevents browser theme changes
                return;
              } else {
                console.log(
                  "[AdvancedTabGroups] No tab group selected, allowing normal browser theme changes"
                );
                // If no tab group is selected, allow normal browser theme changes
                return await originalOnWorkspaceChange.call(
                  this,
                  workspace,
                  skipUpdate,
                  theme
                );
              }
            };

            // Now click the button to open the picker
            existingButton.click();

            // Set up a listener for when the panel closes to apply the final color and cleanup
            const panel = window.gZenThemePicker.panel;
            const handlePanelClose = () => {
              try {
                console.log(
                  "[AdvancedTabGroups] Panel closed, applying final color and cleaning up"
                );

                // Get the final color from the dots using the same logic
                const dots = window.gZenThemePicker.panel.querySelectorAll(
                  ".zen-theme-picker-dot"
                );
                const colors = Array.from(dots)
                  .map((dot) => {
                    if (!dot || !dot.style) {
                      return null;
                    }

                    const colorValue = dot.style.getPropertyValue(
                      "--zen-theme-picker-dot-color"
                    );
                    if (!colorValue || colorValue === "undefined") {
                      return null;
                    }

                    const isPrimary = dot.classList.contains("primary");
                    const type = dot.getAttribute("data-type");

                    // Handle both RGB and hex colors
                    let rgb;
                    if (colorValue.startsWith("rgb")) {
                      rgb = colorValue.match(/\d+/g)?.map(Number) || [0, 0, 0];
                    } else if (colorValue.startsWith("#")) {
                      // Convert hex to RGB
                      const hex = colorValue.replace("#", "");
                      rgb = [
                        parseInt(hex.substr(0, 2), 16),
                        parseInt(hex.substr(2, 2), 16),
                        parseInt(hex.substr(4, 2), 16),
                      ];
                    } else {
                      rgb = [0, 0, 0];
                    }

                    return {
                      c: rgb,
                      isPrimary: isPrimary,
                      type: type,
                    };
                  })
                  .filter(Boolean);

                if (colors.length > 0) {
                  // Check both references to ensure we don't lose the tab group
                  const currentTabGroup =
                    window.gZenThemePicker._currentTabGroup ||
                    window.gZenThemePicker._tabGroupForColorPicker;

                  if (currentTabGroup) {
                    const gradient = window.gZenThemePicker.getGradient(colors);
                    console.log(
                      "[AdvancedTabGroups] Final gradient generated:",
                      gradient,
                      "from colors:",
                      colors
                    );

                    // Set the --tab-group-color CSS variable on the group
                    currentTabGroup.style.setProperty(
                      "--tab-group-color",
                      gradient
                    );

                    // For simplicity, set the inverted color to the same value
                    currentTabGroup.style.setProperty(
                      "--tab-group-color-invert",
                      gradient
                    );

                    console.log(
                      "[AdvancedTabGroups] Final color applied to group:",
                      currentTabGroup.id,
                      "Color:",
                      gradient
                    );

                    // Save the color to persistent storage (use plugin instance)
                    atg.saveTabGroupColors();
                  }
                }

                // CRITICAL: Clean up all references and restore original methods
                delete window.gZenThemePicker._currentTabGroup;
                delete window.gZenThemePicker._tabGroupForColorPicker;
                window.gZenThemePicker.updateCurrentWorkspace =
                  originalUpdateMethod;
                window.gZenThemePicker.onWorkspaceChange =
                  originalOnWorkspaceChange;

                // Remove the event listener
                panel.removeEventListener("popuphidden", handlePanelClose);

                // Clear any stored color data to prevent persistence
                if (window.gZenThemePicker.dots) {
                  window.gZenThemePicker.dots.forEach((dot) => {
                    if (dot.element && dot.element.style) {
                      dot.element.style.removeProperty(
                        "--zen-theme-picker-dot-color"
                      );
                    }
                  });
                }

                console.log(
                  "[AdvancedTabGroups] Cleanup completed, color picker restored to normal operation"
                );
              } catch (error) {
                console.error(
                  "[AdvancedTabGroups] Error during cleanup:",
                  error
                );
                // Ensure cleanup happens even if there's an error
                try {
                  delete window.gZenThemePicker._currentTabGroup;
                  delete window.gZenThemePicker._tabGroupForColorPicker;
                  window.gZenThemePicker.updateCurrentWorkspace =
                    originalUpdateMethod;
                  window.gZenThemePicker.onWorkspaceChange =
                    originalOnWorkspaceChange;
                  panel.removeEventListener("popuphidden", handlePanelClose);
                } catch (cleanupError) {
                  console.error(
                    "[AdvancedTabGroups] Error during error cleanup:",
                    cleanupError
                  );
                }
              }
            };

            panel.addEventListener("popuphidden", handlePanelClose);
          } else {
            // Fallback: try to open the panel directly with proper sizing
            if (window.gZenThemePicker && window.gZenThemePicker.panel) {
              const panel = window.gZenThemePicker.panel;

              // Force the panel to show its content
              panel.style.width = "400px";
              panel.style.height = "600px";
              panel.style.minWidth = "400px";
              panel.style.minHeight = "600px";

              // Trigger initialization events
              panel.dispatchEvent(new Event("popupshowing"));

              // Open at a reasonable position
              const rect = group.getBoundingClientRect();
              panel.openPopupAtScreen(rect.left, rect.bottom + 10, false);
            } else {
              console.error(
                "[AdvancedTabGroups] Gradient picker not available"
              );
            }
          }
        } catch (error) {
          console.error(
            "[AdvancedTabGroups] Error opening gradient picker:",
            error
          );
          // Last resort: try to open the panel directly
          try {
            if (window.gZenThemePicker && window.gZenThemePicker.panel) {
              const panel = window.gZenThemePicker.panel;
              panel.style.width = "400px";
              panel.style.height = "600px";
              panel.openPopupAtScreen(0, 0, false);
            }
          } catch (fallbackError) {
            console.error(
              "[AdvancedTabGroups] Fallback panel opening also failed:",
              fallbackError
            );
          }
        }
      } else {
        console.warn("[AdvancedTabGroups] Gradient picker not available");
      }
    };

    group._changeGroupIcon = () => {
      this.changeGroupIcon(group);
    };

    group._useFaviconColor = () => {
      console.log(
        "[AdvancedTabGroups] Use Average Favicon Color clicked for group:",
        group.id
      );

      try {
        // Get all favicon images directly from the group
        const favicons = group.querySelectorAll(".tab-icon-image");
        if (favicons.length === 0) {
          console.log("[AdvancedTabGroups] No favicons found in group");
          return;
        }

        console.log(
          "[AdvancedTabGroups] Found",
          favicons.length,
          "favicons in group"
        );

        // Extract colors from favicons
        const colors = [];
        let processedCount = 0;
        const totalFavicons = favicons.length;

        favicons.forEach((favicon, index) => {
          if (favicon && favicon.src) {
            console.log(
              "[AdvancedTabGroups] Processing favicon",
              index + 1,
              "of",
              totalFavicons,
              ":",
              favicon.src
            );

            // Create a canvas to analyze the favicon
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const img = new Image();

            img.onload = () => {
              try {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );
                const data = imageData.data;

                // Sample pixels and extract colors
                let r = 0,
                  g = 0,
                  b = 0,
                  count = 0;
                for (let i = 0; i < data.length; i += 4) {
                  // Skip transparent pixels and very dark pixels
                  if (
                    data[i + 3] > 128 &&
                    data[i] + data[i + 1] + data[i + 2] > 30
                  ) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                  }
                }

                if (count > 0) {
                  const avgColor = [
                    Math.round(r / count),
                    Math.round(g / count),
                    Math.round(b / count),
                  ];
                  colors.push(avgColor);
                  console.log(
                    "[AdvancedTabGroups] Extracted color from favicon",
                    index + 1,
                    ":",
                    avgColor
                  );
                } else {
                  console.log(
                    "[AdvancedTabGroups] No valid pixels found in favicon",
                    index + 1
                  );
                }

                processedCount++;

                // If this is the last favicon processed, calculate average and apply
                if (processedCount === totalFavicons) {
                  if (colors.length > 0) {
                    const finalColor = this._calculateAverageColor(colors);
                    const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

                    // Set the --tab-group-color CSS variable
                    group.style.setProperty("--tab-group-color", colorString);
                    group.style.setProperty(
                      "--tab-group-color-invert",
                      colorString
                    );
                    console.log(
                      "[AdvancedTabGroups] Applied average favicon color to group:",
                      group.id,
                      "Color:",
                      colorString,
                      "from",
                      colors.length,
                      "favicons"
                    );

                    // Save the color to persistent storage
                    this.saveTabGroupColors();
                  } else {
                    console.log(
                      "[AdvancedTabGroups] No valid colors extracted from any favicons"
                    );
                  }
                }
              } catch (error) {
                console.error(
                  "[AdvancedTabGroups] Error processing favicon",
                  index + 1,
                  ":",
                  error
                );
                processedCount++;

                // Still check if we're done processing
                if (processedCount === totalFavicons && colors.length > 0) {
                  const finalColor = this._calculateAverageColor(colors);
                  const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

                  group.style.setProperty("--tab-group-color", colorString);
                  group.style.setProperty(
                    "--tab-group-color-invert",
                    colorString
                  );
                  console.log(
                    "[AdvancedTabGroups] Applied average favicon color to group:",
                    group.id,
                    "Color:",
                    colorString,
                    "from",
                    colors.length,
                    "favicons (some failed)"
                  );

                  this.saveTabGroupColors();
                }
              }
            };

            img.onerror = () => {
              console.log(
                "[AdvancedTabGroups] Failed to load favicon",
                index + 1,
                ":",
                favicon.src
              );
              processedCount++;

              // Check if we're done processing
              if (processedCount === totalFavicons && colors.length > 0) {
                const finalColor = this._calculateAverageColor(colors);
                const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

                group.style.setProperty("--tab-group-color", colorString);
                group.style.setProperty(
                  "--tab-group-color-invert",
                  colorString
                );
                console.log(
                  "[AdvancedTabGroups] Applied average favicon color to group:",
                  group.id,
                  "Color:",
                  colorString,
                  "from",
                  colors.length,
                  "favicons (some failed to load)"
                );

                this.saveTabGroupColors();
              }
            };

            img.src = favicon.src;
          } else {
            console.log("[AdvancedTabGroups] Favicon", index + 1, "has no src");
            processedCount++;

            // Check if we're done processing
            if (processedCount === totalFavicons && colors.length > 0) {
              const finalColor = this._calculateAverageColor(colors);
              const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

              group.style.setProperty("--tab-group-color", colorString);
              group.style.setProperty("--tab-group-color-invert", colorString);
              console.log(
                "[AdvancedTabGroups] Applied average favicon color to group:",
                group.id,
                "Color:",
                colorString,
                "from",
                colors.length,
                "favicons (some had no src)"
              );

              this.saveTabGroupColors();
            }
          }
        });

        if (favicons.length === 0) {
          console.log("[AdvancedTabGroups] No favicons found in group");
        }
      } catch (error) {
        console.error(
          "[AdvancedTabGroups] Error extracting favicon colors:",
          error
        );
      }
    };
  }

  // New method to convert group to folder
  convertGroupToFolder(group) {
    console.log("[AdvancedTabGroups] Converting group to folder:", group.id);

    try {
      // Check if Zen folders functionality is available
      if (!window.gZenFolders) {
        console.error(
          "[AdvancedTabGroups] Zen folders functionality not available"
        );
        return;
      }

      // Get all tabs in the group
      const tabs = Array.from(group.tabs);
      if (tabs.length === 0) {
        console.log("[AdvancedTabGroups] No tabs found in group to convert");
        return;
      }

      console.log(
        "[AdvancedTabGroups] Found",
        tabs.length,
        "tabs to convert to folder"
      );

      // Get the group name for the new folder
      const groupName = group.label || "New Folder";

      // Create a new folder using Zen folders functionality
      const newFolder = window.gZenFolders.createFolder(tabs, {
        label: groupName,
        renameFolder: false, // Don't prompt for rename since we're using the group name
        workspaceId:
          group.getAttribute("zen-workspace-id") ||
          window.gZenWorkspaces?.activeWorkspace,
      });

      if (newFolder) {
        console.log(
          "[AdvancedTabGroups] Successfully created folder:",
          newFolder.id
        );

        // Remove the original group
        try {
          gBrowser.removeTabGroup(group);
          console.log(
            "[AdvancedTabGroups] Successfully removed original group:",
            group.id
          );
        } catch (error) {
          console.error(
            "[AdvancedTabGroups] Error removing original group:",
            error
          );
        }

        // Remove the saved color and icon for the original group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);

        console.log(
          "[AdvancedTabGroups] Group successfully converted to folder"
        );
      } else {
        console.error("[AdvancedTabGroups] Failed to create folder");
      }
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error converting group to folder:",
        error
      );
    }
  }

  convertFolderToGroup(folder) {
    console.log("[AdvancedTabGroups] Converting folder to group:", folder.id);
    try {
      const tabsToGroup = folder.allItemsRecursive.filter(
        (item) => gBrowser.isTab(item) && !item.hasAttribute("zen-empty-tab")
      );

      const folderName = folder.label || "New Group";

      if (tabsToGroup.length === 0) {
        console.log(
          "[AdvancedTabGroups] No tabs in folder, removing empty folder."
        );
        if (
          folder &&
          folder.isConnected &&
          typeof folder.delete === "function"
        ) {
          folder.delete();
        }
        return;
      }

      // Unpin all tabs before attempting to group them
      tabsToGroup.forEach((tab) => {
        if (tab.pinned) {
          gBrowser.unpinTab(tab);
        }
      });

      // Use a brief timeout to allow the UI to process the unpinning before creating the group.
      setTimeout(() => {
        try {
          const newGroup = document.createXULElement("tab-group");
          newGroup.id = `${Date.now()}-${Math.round(Math.random() * 100)}`;
          newGroup.label = folderName;

          const unpinnedTabsContainer =
            gZenWorkspaces.activeWorkspaceStrip ||
            gBrowser.tabContainer.querySelector("tabs");
          unpinnedTabsContainer.prepend(newGroup);

          newGroup.addTabs(tabsToGroup);

          if (
            folder &&
            folder.isConnected &&
            typeof folder.delete === "function"
          ) {
            folder.delete();
          }

          this.processGroup(newGroup);

          console.log(
            "[AdvancedTabGroups] Folder successfully converted to group:",
            newGroup.id
          );
        } catch (groupingError) {
          console.error(
            "[AdvancedTabGroups] Error during manual group creation:",
            groupingError
          );
        }
      }, 200);
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error converting folder to group:",
        error
      );
    }
  }

  // Change group icon using the Zen emoji picker (SVG icons only)
  async changeGroupIcon(group) {
    console.log(
      "[AdvancedTabGroups] Change Group Icon clicked for group:",
      group.id
    );

    try {
      // Check if the Zen emoji picker is available
      if (!window.gZenEmojiPicker) {
        console.error("[AdvancedTabGroups] Zen emoji picker not available");
        return;
      }

      // Find the icon container in the group
      const iconContainer = group.querySelector(".tab-group-icon-container");
      if (!iconContainer) {
        console.error(
          "[AdvancedTabGroups] Icon container not found for group:",
          group.id
        );
        return;
      }

      // Find the icon element (create if it doesn't exist)
      let iconElement = iconContainer.querySelector(".tab-group-icon");
      if (!iconElement) {
        iconElement = document.createElement("div");
        iconElement.className = "tab-group-icon";
        iconContainer.appendChild(iconElement);
      }

      // Open the emoji picker with SVG icons only
      const selectedIcon = await window.gZenEmojiPicker.open(iconElement, {
        onlySvgIcons: true,
      });

      if (selectedIcon) {
        console.log("[AdvancedTabGroups] Selected icon:", selectedIcon);

        // Clear any existing icon content
        iconElement.innerHTML = "";

        // Create an image element for the SVG icon using parsed XUL
        const imgFrag = window.MozXULElement.parseXULToFragment(`
          <image src="${selectedIcon}" class="group-icon" alt="Group Icon"/>
        `);
        iconElement.appendChild(imgFrag.firstElementChild);

        // Save the icon to persistent storage
        this.saveGroupIcon(group.id, selectedIcon);

        console.log("[AdvancedTabGroups] Icon applied to group:", group.id);
      } else if (selectedIcon === null) {
        console.log("[AdvancedTabGroups] Icon removal requested");

        // Clear the icon content
        iconElement.innerHTML = "";

        // Remove the icon from persistent storage
        this.removeSavedIcon(group.id);

        console.log("[AdvancedTabGroups] Icon removed from group:", group.id);
      } else {
        console.log("[AdvancedTabGroups] No icon selected");
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error changing group icon:", error);
    }
  }

  // Helper method to calculate average color
  _calculateAverageColor(colors) {
    if (colors.length === 0) return [0, 0, 0];

    const total = colors.reduce(
      (acc, color) => {
        acc[0] += color[0];
        acc[1] += color[1];
        acc[2] += color[2];
        return acc;
      },
      [0, 0, 0]
    );

    return [
      Math.round(total[0] / colors.length),
      Math.round(total[1] / colors.length),
      Math.round(total[2] / colors.length),
    ];
  }

  // Helper method to determine contrast color (black or white) for a given background color
  _getContrastColor(backgroundColor) {
    try {
      // Parse the background color to get RGB values
      let r, g, b;

      if (backgroundColor.startsWith("rgb")) {
        // Handle rgb(r, g, b) format
        const match = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          r = parseInt(match[1]);
          g = parseInt(match[2]);
          b = parseInt(match[3]);
        }
      } else if (backgroundColor.startsWith("#")) {
        // Handle hex format
        const hex = backgroundColor.replace("#", "");
        r = parseInt(hex.substr(0, 2), 16);
        g = parseInt(hex.substr(2, 2), 16);
        b = parseInt(hex.substr(4, 2), 16);
      } else if (backgroundColor.startsWith("linear-gradient")) {
        // For gradients, extract the first color
        const match = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          r = parseInt(match[1]);
          g = parseInt(match[2]);
          b = parseInt(match[3]);
        }
      }

      if (r !== undefined && g !== undefined && b !== undefined) {
        // Calculate relative luminance using the sRGB formula
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return 'white' for dark backgrounds, 'black' for light backgrounds
        return luminance > 0.5 ? "black" : "white";
      }
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error calculating contrast color:",
        error
      );
    }

    // Default to black if we can't parse the color
    return "black";
  }

  // Clear any stored color picker data to prevent persistence issues
  clearStoredColorData() {
    try {
      if (window.gZenThemePicker) {
        // Clear any stored tab group references
        delete window.gZenThemePicker._currentTabGroup;
        delete window.gZenThemePicker._tabGroupForColorPicker;

        // Clear any stored color data on dots
        if (window.gZenThemePicker.dots) {
          window.gZenThemePicker.dots.forEach((dot) => {
            if (dot.element && dot.element.style) {
              dot.element.style.removeProperty("--zen-theme-picker-dot-color");
            }
          });
        }

        // Clear any stored color data in the panel
        if (window.gZenThemePicker.panel) {
          const dots = window.gZenThemePicker.panel.querySelectorAll(
            ".zen-theme-picker-dot"
          );
          dots.forEach((dot) => {
            if (dot.style) {
              dot.style.removeProperty("--zen-theme-picker-dot-color");
            }
          });
        }

        // Reset the color picker to its default state
        this.resetColorPickerToDefault();

        console.log("[AdvancedTabGroups] Stored color data cleared");
      }
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error clearing stored color data:",
        error
      );
    }
  }

  // Reset the color picker to its default state
  resetColorPickerToDefault() {
    try {
      if (window.gZenThemePicker) {
        // Reset any workspace or theme data that might be cached
        if (window.gZenThemePicker.currentWorkspace) {
          // Force a refresh of the current workspace
          window.gZenThemePicker.currentWorkspace = null;
        }

        // Clear any cached theme data
        if (window.gZenThemePicker.currentTheme) {
          window.gZenThemePicker.currentTheme = null;
        }

        // Reset the dots to their default state
        if (window.gZenThemePicker.dots) {
          window.gZenThemePicker.dots.forEach((dot) => {
            if (dot.element && dot.element.style) {
              // Remove any custom color properties
              dot.element.style.removeProperty("--zen-theme-picker-dot-color");
              dot.element.style.removeProperty("background-color");
              dot.element.style.removeProperty("border-color");
            }
          });
        }

        console.log("[AdvancedTabGroups] Color picker reset to default state");
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error resetting color picker:", error);
    }
  }

  // Save tab group colors to persistent storage
  async saveTabGroupColors() {
    try {
      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        const colors = {};

        // Get all tab groups and their colors (excluding split-view-groups)
        const groups = document.querySelectorAll("tab-group");
        groups.forEach((group) => {
          if (group.id && !group.hasAttribute("split-view-group")) {
            const color = group.style.getPropertyValue("--tab-group-color");
            if (color && color !== "") {
              colors[group.id] = color;
            }
          }
        });

        // Save to file
        const jsonData = JSON.stringify(colors, null, 2);
        await UC_API.FileSystem.writeFile("tab_group_colors.json", jsonData);
        console.log("[AdvancedTabGroups] Tab group colors saved:", colors);
      } else {
        console.warn(
          "[AdvancedTabGroups] UC_API.FileSystem not available, using localStorage fallback"
        );
        // Fallback to localStorage if UC_API is not available
        const colors = {};
        const groups = document.querySelectorAll("tab-group");
        groups.forEach((group) => {
          if (group.id && !group.hasAttribute("split-view-group")) {
            const color = group.style.getPropertyValue("--tab-group-color");
            if (color && color !== "") {
              colors[group.id] = color;
            }
          }
        });
        localStorage.setItem(
          "advancedTabGroups_colors",
          JSON.stringify(colors)
        );
        console.log(
          "[AdvancedTabGroups] Tab group colors saved to localStorage:",
          colors
        );
      }
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error saving tab group colors:",
        error
      );
    }
  }

  // Load saved tab group colors from persistent storage
  async loadSavedColors() {
    try {
      let colors = {};

      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        try {
          // Try to read from file
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_colors.json"
          );
          if (fsResult.isContent()) {
            colors = JSON.parse(fsResult.content());
            console.log("[AdvancedTabGroups] Loaded colors from file:", colors);
          }
        } catch (fileError) {
          console.log(
            "[AdvancedTabGroups] No saved color file found, starting fresh"
          );
        }
      } else {
        // Fallback to localStorage
        const savedColors = localStorage.getItem("advancedTabGroups_colors");
        if (savedColors) {
          colors = JSON.parse(savedColors);
          console.log(
            "[AdvancedTabGroups] Loaded colors from localStorage:",
            colors
          );
        }
      }

      // Apply colors to existing groups
      if (Object.keys(colors).length > 0) {
        setTimeout(() => {
          this.applySavedColors(colors);
        }, 500); // Small delay to ensure groups are fully loaded
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error loading saved colors:", error);
    }
  }

  // Apply saved colors to tab groups
  applySavedColors(colors) {
    try {
      Object.entries(colors).forEach(([groupId, color]) => {
        const group = document.getElementById(groupId);
        if (group && !group.hasAttribute("split-view-group")) {
          group.style.setProperty("--tab-group-color", color);
          group.style.setProperty("--tab-group-color-invert", color);
          console.log(
            "[AdvancedTabGroups] Applied saved color to group:",
            groupId,
            color
          );
        }
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved colors:", error);
    }
  }

  // Remove saved color for a specific tab group
  async removeSavedColor(groupId) {
    try {
      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        try {
          // Read current colors
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_colors.json"
          );
          if (fsResult.isContent()) {
            const colors = JSON.parse(fsResult.content());
            delete colors[groupId];

            // Save updated colors
            const jsonData = JSON.stringify(colors, null, 2);
            await UC_API.FileSystem.writeFile(
              "tab_group_colors.json",
              jsonData
            );
            console.log(
              "[AdvancedTabGroups] Removed saved color for group:",
              groupId
            );
          }
        } catch (fileError) {
          console.log(
            "[AdvancedTabGroups] No saved color file found to remove from"
          );
        }
      } else {
        // Fallback to localStorage
        const savedColors = localStorage.getItem("advancedTabGroups_colors");
        if (savedColors) {
          const colors = JSON.parse(savedColors);
          delete colors[groupId];
          localStorage.setItem(
            "advancedTabGroups_colors",
            JSON.stringify(colors)
          );
          console.log(
            "[AdvancedTabGroups] Removed saved color for group:",
            groupId
          );
        }
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved color:", error);
    }
  }

  // Save group icon to persistent storage
  async saveGroupIcon(groupId, iconUrl) {
    try {
      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        // Read current icons
        let icons = {};
        try {
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_icons.json"
          );
          if (fsResult.isContent()) {
            icons = JSON.parse(fsResult.content());
          }
        } catch (fileError) {
          console.log(
            "[AdvancedTabGroups] No saved icon file found, creating new one"
          );
        }

        // Update with new icon
        icons[groupId] = iconUrl;

        // Save to file
        const jsonData = JSON.stringify(icons, null, 2);
        await UC_API.FileSystem.writeFile("tab_group_icons.json", jsonData);
        console.log("[AdvancedTabGroups] Group icon saved:", groupId, iconUrl);
      } else {
        // Fallback to localStorage
        const savedIcons = localStorage.getItem("advancedTabGroups_icons");
        let icons = savedIcons ? JSON.parse(savedIcons) : {};
        icons[groupId] = iconUrl;
        localStorage.setItem("advancedTabGroups_icons", JSON.stringify(icons));
        console.log(
          "[AdvancedTabGroups] Group icon saved to localStorage:",
          groupId,
          iconUrl
        );
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error saving group icon:", error);
    }
  }

  // Load saved group icons from persistent storage
  async loadGroupIcons() {
    try {
      let icons = {};

      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        try {
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_icons.json"
          );
          if (fsResult.isContent()) {
            icons = JSON.parse(fsResult.content());
            console.log("[AdvancedTabGroups] Loaded icons from file:", icons);
          }
        } catch (fileError) {
          console.log("[AdvancedTabGroups] No saved icon file found");
        }
      } else {
        // Fallback to localStorage
        const savedIcons = localStorage.getItem("advancedTabGroups_icons");
        if (savedIcons) {
          icons = JSON.parse(savedIcons);
          console.log(
            "[AdvancedTabGroups] Loaded icons from localStorage:",
            icons
          );
        }
      }

      // Apply icons to existing groups
      if (Object.keys(icons).length > 0) {
        setTimeout(() => {
          this.applySavedIcons(icons);
        }, 500); // Small delay to ensure groups are fully loaded
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error loading saved icons:", error);
    }
  }

  // Apply saved icons to tab groups
  applySavedIcons(icons) {
    try {
      Object.entries(icons).forEach(([groupId, iconUrl]) => {
        const group = document.getElementById(groupId);
        if (group && !group.hasAttribute("split-view-group")) {
          const iconContainer = group.querySelector(
            ".tab-group-icon-container"
          );
          if (iconContainer) {
            let iconElement = iconContainer.querySelector(".tab-group-icon");
            if (!iconElement) {
              iconElement = document.createElement("div");
              iconElement.className = "tab-group-icon";
              iconContainer.appendChild(iconElement);
            }

            // Clear any existing content and add the icon
            iconElement.innerHTML = "";
            const imgFrag = window.MozXULElement.parseXULToFragment(`
              <image src="${iconUrl}" class="group-icon" alt="Group Icon"/>
            `);
            iconElement.appendChild(imgFrag.firstElementChild);

            console.log(
              "[AdvancedTabGroups] Applied saved icon to group:",
              groupId,
              iconUrl
            );
          }
        }
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved icons:", error);
    }
  }

  // Remove saved icon for a specific tab group
  async removeSavedIcon(groupId) {
    try {
      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        try {
          // Read current icons
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_icons.json"
          );
          if (fsResult.isContent()) {
            const icons = JSON.parse(fsResult.content());
            delete icons[groupId];

            // Save updated icons
            const jsonData = JSON.stringify(icons, null, 2);
            await UC_API.FileSystem.writeFile("tab_group_icons.json", jsonData);
            console.log(
              "[AdvancedTabGroups] Removed saved icon for group:",
              groupId
            );
          }
        } catch (fileError) {
          console.log(
            "[AdvancedTabGroups] No saved icon file found to remove from"
          );
        }
      } else {
        // Fallback to localStorage
        const savedIcons = localStorage.getItem("advancedTabGroups_icons");
        if (savedIcons) {
          const icons = JSON.parse(savedIcons);
          delete icons[groupId];
          localStorage.setItem(
            "advancedTabGroups_icons",
            JSON.stringify(icons)
          );
          console.log(
            "[AdvancedTabGroups] Removed saved icon for group:",
            groupId
          );
        }
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved icon:", error);
    }
  }
  setupStash() {
    const createMenu = document.getElementById("zenCreateNewPopup");

    const stashButton = window.MozXULElement.parseXULToFragment(`
          <menuseparator/>
          <menu id="open-group-stash" label="Open Group Stash (Coming Soon! Sorry)">
            <!-- Things will go here like stashed groups -->
          </menu>
        `);
    createMenu.appendChild(stashButton);
    console.log(createMenu);

    stashButton.addEventListener("command", () => {});
  }
}

// Initialize when the page loads
(function () {
  if (!globalThis.advancedTabGroups) {
    window.addEventListener(
      "load",
      () => {
        console.log("[AdvancedTabGroups] Page loaded, initializing");
        globalThis.advancedTabGroups = new AdvancedTabGroups();
      },
      { once: true }
    );

    // Clean up when the page is about to unload
    window.addEventListener("beforeunload", () => {
      if (globalThis.advancedTabGroups) {
        globalThis.advancedTabGroups.clearStoredColorData();
        globalThis.advancedTabGroups.saveTabGroupColors();
        console.log(
          "[AdvancedTabGroups] Cleanup and save completed before page unload"
        );
      }
    });

    // Hide tab group menu items for folders in tab context menu
    const tabContextMenu = document.getElementById("tabContextMenu");
    if (tabContextMenu) {
      tabContextMenu.addEventListener("popupshowing", () => {
        // selecting folders to hide
        const foldersToHide = Array.from(
          gBrowser.tabContainer.querySelectorAll("zen-folder")
        ).map((f) => f.id);

        // finding menu items with tab group id
        const groupMenuItems = document.querySelectorAll(
          "#context_moveTabToGroupPopupMenu menuitem[tab-group-id]"
        );

        // Iterate over each item and hide one present in folderstohide array.
        for (const menuItem of groupMenuItems) {
          const tabGroupId = menuItem.getAttribute("tab-group-id");

          if (foldersToHide.includes(tabGroupId)) {
            menuItem.hidden = true;
          }
        }
      });
    }
    //  ^
    //  |
    // Thx to Bibek for this snippet! bibekbhusal on Discord.
  }
})();
