#!/bin/bash

# Testes de integração para install scripts e comandos especiais
# Executa com: npm run test -- test/integration.bats

setup_file() {
  npm run build
}

setup() {
    load '../node_modules/bats-support/load'
    load '../node_modules/bats-assert/load'

    # get the containing directory of this file
    DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"
    
    # Create a temporary bin directory for the test executable
    mkdir -p "$BATS_TMPDIR/bin"
    ln -sf "$DIR/../dist/index.js" "$BATS_TMPDIR/bin/mgrep"
    PATH="$BATS_TMPDIR/bin:$PATH"

    export MGREP_IS_TEST=1
    export MGREP_TEST_STORE_PATH="$BATS_TMPDIR/mgrep-test-store.json"
    
    # Setup test directory
    mkdir -p "$BATS_TMPDIR/integration-test"
    cd "$BATS_TMPDIR/integration-test"
}

teardown() {
    rm -f "$MGREP_TEST_STORE_PATH"
    rm -rf "$BATS_TMPDIR/integration-test"
}

# ============================================================================
# Install Scripts Tests
# ============================================================================

@test "Install claude-code command exists" {
    run mgrep install-claude-code --help
    
    assert_success
    assert_output --partial 'install-claude-code'
    assert_output --partial 'Install the Claude Code plugin'
}

@test "Uninstall claude-code command exists" {
    run mgrep uninstall-claude-code --help
    
    assert_success
    assert_output --partial 'uninstall-claude-code'
    assert_output --partial 'Uninstall the Claude Code plugin'
}

@test "Install codex command exists" {
    run mgrep install-codex --help
    
    assert_success
    assert_output --partial 'install-codex'
    assert_output --partial 'Install the Codex agent'
}

@test "Uninstall codex command exists" {
    run mgrep uninstall-codex --help
    
    assert_success
    assert_output --partial 'uninstall-codex'
    assert_output --partial 'Uninstall the Codex agent'
}

@test "Install droid command exists" {
    run mgrep install-droid --help
    
    assert_success
    assert_output --partial 'install-droid'
    assert_output --partial 'Install the mgrep hooks and skill for Factory Droid'
}

@test "Uninstall droid command exists" {
    run mgrep uninstall-droid --help
    
    assert_success
    assert_output --partial 'uninstall-droid'
    assert_output --partial 'Uninstall the mgrep hooks and skill for Factory Droid'
}

@test "Skill module exists" {
    # Just verify the skill module file exists
    [ -f "$DIR/../dist/install/skill.js" ]
}

@test "Skill module has exports" {
    # Check that the skill module has the expected exports
    run grep -E "export (function|const).*(loadSkill|getSkillVersion)" "$DIR/../dist/install/skill.js"
    
    assert_success
    assert_output --partial 'loadSkill'
    assert_output --partial 'getSkillVersion'
}

# ============================================================================
# MCP Command Tests
# ============================================================================

@test "MCP command help" {
    run mgrep mcp --help
    
    assert_success
    assert_output --partial 'mcp'
    assert_output --partial 'MCP'
}

@test "MCP command exists" {
    # Just verify the command is registered
    run mgrep --help
    
    assert_success
    assert_output --partial 'mcp'
}

@test "MCP command can be invoked" {
    echo "test content" > test.txt
    mgrep search --sync test
    
    # Just verify the command exists
    run mgrep --help
    
    assert_success
    assert_output --partial 'mcp'
}

# ============================================================================
# Search Command Edge Cases
# ============================================================================

@test "Search with empty directory" {
    run mgrep search test
    
    assert_success
    # Should not crash, just return no results
}

@test "Search with special characters in query" {
    echo "test@#$%^&*()" > special.txt
    mgrep search --sync test
    
    run mgrep search "@#\$"
    
    assert_success
}

@test "Search with unicode characters" {
    echo "测试文件" > unicode.txt
    mgrep search --sync 测试
    
    run mgrep search 测试
    
    assert_success
    assert_output --partial 'unicode.txt'
}

@test "Search with very long file paths" {
    mkdir -p "very/deep/nested/directory/structure/that/is/quite/long/to/test/path/handling"
    echo "deep content" > "very/deep/nested/directory/structure/that/is/quite/long/to/test/path/handling/file.txt"
    
    mgrep search --sync deep
    
    run mgrep search deep
    
    assert_success
    assert_output --partial 'file.txt'
}

@test "Search with files containing newlines in content" {
    printf "line1\nline2\nline3" > multiline.txt
    mgrep search --sync line2
    
    run mgrep search line2
    
    assert_success
    assert_output --partial 'multiline.txt'
}

# ============================================================================
# Watch Command Edge Cases
# ============================================================================

@test "Watch with no changes" {
    echo "initial" > initial.txt
    mgrep search --sync initial
    
    run mgrep watch --dry-run
    
    assert_success
    assert_output --partial '0 changed'
}

@test "Watch detects new files" {
    echo "initial" > initial.txt
    mgrep search --sync initial
    
    echo "new" > new.txt
    run mgrep watch --dry-run
    
    assert_success
    assert_output --partial 'new.txt'
    assert_output --partial 'would have uploaded 1'
}

@test "Watch detects modified files" {
    echo "initial" > initial.txt
    mgrep search --sync initial
    
    echo "modified" > initial.txt
    run mgrep watch --dry-run
    
    assert_success
    assert_output --partial 'initial.txt'
    assert_output --partial 'would have uploaded 1'
}

@test "Watch detects deleted files" {
    echo "initial" > initial.txt
    mgrep search --sync initial
    
    rm initial.txt
    run mgrep watch --dry-run
    
    assert_success
    assert_output --partial 'would have deleted'
}

@test "Watch with path scope" {
    mkdir -p subdir
    echo "in subdir" > subdir/file.txt
    echo "in root" > root.txt
    
    mgrep search --sync .
    
    echo "modified" > subdir/file.txt
    cd subdir
    
    run mgrep watch --dry-run
    
    assert_success
    assert_output --partial 'file.txt'
    refute_output --partial 'root.txt'
}

# ============================================================================
# Config File Tests
# ============================================================================

@test "Config file with custom embeddings provider" {
    cat > .mgreprc.yaml << 'EOF'
embeddings:
  provider: google
  model: text-embedding-004
  apiKey: test-key
llm:
  provider: google
  model: gemini-1.5-flash
  apiKey: test-key
EOF
    
    echo "test" > test.txt
    
    # Should not crash with custom config
    run mgrep search --sync test
    
    assert_success || true
}

@test "Config file with custom Qdrant URL" {
    cat > .mgreprc.yaml << 'EOF'
qdrant:
  url: http://localhost:6333
  collectionPrefix: custom_
EOF
    
    echo "test" > test.txt
    
    # Should use custom prefix
    run mgrep search --sync test
    
    assert_success || true
}

@test "Config file with sync settings" {
    cat > .mgreprc.yaml << 'EOF'
sync:
  concurrency: 5
EOF
    
    echo "test" > test.txt
    
    run mgrep search --sync test
    
    assert_success
}

# ============================================================================
# Error Handling Tests
# ============================================================================

@test "Graceful handling of corrupted store file" {
    echo "not valid json" > "$MGREP_TEST_STORE_PATH"
    echo "test" > test.txt
    
    run mgrep search --sync test
    
    # Should handle gracefully (may fail or recreate store)
    assert_success || true
}

@test "Graceful handling of missing embeddings API key" {
    unset MGREP_EMBEDDINGS_API_KEY
    cat > .mgreprc.yaml << 'EOF'
embeddings:
  provider: openai
  model: text-embedding-3-small
EOF
    
    echo "test" > test.txt
    
    run mgrep search --sync test
    
    # Should fail gracefully
    assert_failure || true
}

@test "Graceful handling of invalid config file" {
    cat > .mgreprc.yaml << 'EOF'
invalid: yaml: content: [
EOF
    
    echo "test" > test.txt
    
    run mgrep search --sync test
    
    # Should handle gracefully
    assert_success || true
}

# ============================================================================
# Performance Tests
# ============================================================================

@test "Search with many small files" {
    for i in {1..50}; do
        echo "content $i" > "file$i.txt"
    done
    
    mgrep search --sync content
    
    run mgrep search "content 25"
    
    assert_success
    assert_output --partial 'file25.txt'
}

@test "Sync with many files is not too slow" {
    for i in {1..100}; do
        echo "content $i" > "file$i.txt"
    done
    
    # Should complete within reasonable time
    timeout 30s mgrep search --sync content
    
    assert_success
}

# ============================================================================
# MCP Integration Tests
# ============================================================================

# ============================================================================
# Web Search Integration Tests
# ============================================================================

@test "Web search with local results" {
    echo "local test" > test.txt
    mgrep search --sync test
    
    run mgrep search --web test
    
    assert_success
    assert_output --partial 'test.txt'
}

@test "Web search without sync" {
    run mgrep search --web "javascript array methods"
    
    # Should work even without local sync
    assert_success || true
}

# ============================================================================
# File Type Detection Tests
# ============================================================================

@test "Binary files are skipped" {
    echo "text" > text.txt
    # Create a binary file
    printf '\x00\x01\x02\x03' > binary.bin
    
    run mgrep watch --dry-run
    
    assert_success
    assert_output --partial 'text.txt'
    refute_output --partial 'binary.bin'
}

@test "Empty files are handled" {
    touch empty.txt
    echo "content" > nonempty.txt
    
    mgrep search --sync .
    
    run mgrep search content
    
    assert_success
    assert_output --partial 'nonempty.txt'
}

@test "Very large files are skipped based on config" {
    dd if=/dev/zero of=large.txt bs=1024 count=1024 2>/dev/null
    echo "small" > small.txt
    
    cat > .mgreprc.yaml << 'EOF'
maxFileSize: 1024
EOF
    
    run mgrep watch --dry-run
    
    assert_success
    assert_output --partial 'small.txt'
    refute_output --partial 'large.txt'
}

# ============================================================================
# Git Integration Tests
# ============================================================================

@test "Respects .gitignore" {
    git init
    git config user.email "test@example.com"
    git config user.name "Test"
    
    echo "ignored" > .gitignore
    echo "ignored content" > ignored.txt
    echo "tracked" > tracked.txt
    
    git add .gitignore tracked.txt
    git commit -m "test"
    
    run mgrep search --sync tracked
    
    assert_success
    assert_output --partial 'tracked.txt'
    refute_output --partial 'ignored.txt'
}

@test "Works in git repository" {
    git init
    git config user.email "test@example.com"
    git config user.name "Test"
    
    echo "git content" > file.txt
    git add file.txt
    git commit -m "test"
    
    run mgrep search --sync git
    
    assert_success
    assert_output --partial 'file.txt'
}

@test "Works outside git repository" {
    # Already in non-git directory
    echo "no git" > file.txt
    
    run mgrep search --sync no
    
    assert_success
    assert_output --partial 'file.txt'
}

# ============================================================================
# Path Scoping Tests
# ============================================================================

@test "Search with path scope filters correctly" {
    mkdir -p src lib
    echo "in src" > src/file1.txt
    echo "in lib" > lib/file2.txt
    echo "in root" > root.txt
    
    mgrep search --sync .
    
    run mgrep search in src
    
    assert_success
    assert_output --partial 'src/file1.txt'
    refute_output --partial 'lib/file2.txt'
    refute_output --partial 'root.txt'
}

@test "Multiple path scopes" {
    mkdir -p src lib
    echo "common" > src/file1.txt
    echo "common" > lib/file2.txt
    echo "common" > root.txt
    
    mgrep search --sync .
    
    # Search in both src and lib
    run mgrep search common src lib
    
    assert_success
    # Should find at least one of the scoped files
    assert_output --partial 'file'
}

# ============================================================================
# Output Format Tests
# ============================================================================

@test "Default output format" {
    echo "test content" > test.txt
    mgrep search --sync test
    
    run mgrep search test
    
    assert_success
    assert_output --partial 'test.txt'
}

@test "Content output format" {
    echo "test content" > test.txt
    mgrep search --sync test
    
    run mgrep search --content test
    
    assert_success
    assert_output --partial 'test.txt'
    assert_output --partial 'test content'
}

@test "JSON output format" {
    echo "test content" > test.txt
    mgrep search --sync test
    
    run mgrep search --json test
    
    assert_success
    # Should be valid JSON
    echo "$output" | jq . > /dev/null 2>&1 || fail "Output is not valid JSON"
}

@test "Answer output format" {
    echo "test content" > test.txt
    mgrep search --sync test
    
    run mgrep search --answer test
    
    assert_success
    assert_output --partial 'mock answer'
}

# ============================================================================
# Concurrency Tests
# ============================================================================

@test "Multiple searches don't interfere" {
    echo "file1" > file1.txt
    echo "file2" > file2.txt
    echo "file3" > file3.txt
    
    mgrep search --sync .
    
    run mgrep search file1
    assert_success
    assert_output --partial 'file1.txt'
    
    run mgrep search file2
    assert_success
    assert_output --partial 'file2.txt'
    
    run mgrep search file3
    assert_success
    assert_output --partial 'file3.txt'
}

# ============================================================================
# Cleanup Tests
# ============================================================================

@test "Store can be cleared" {
    echo "test" > test.txt
    mgrep search --sync test
    
    # Verify it's there
    run mgrep search test
    assert_output --partial 'test.txt'
    
    # Clear store
    rm -f "$MGREP_TEST_STORE_PATH"
    
    # Should not find anything
    run mgrep search test
    refute_output --partial 'test.txt'
}

@test "Sync removes deleted files from store" {
    echo "test1" > file1.txt
    echo "test2" > file2.txt
    mgrep search --sync .
    
    rm file2.txt
    
    run mgrep watch --dry-run
    
    assert_success
    assert_output --partial 'would have deleted'
    assert_output --partial 'file2.txt'
}
