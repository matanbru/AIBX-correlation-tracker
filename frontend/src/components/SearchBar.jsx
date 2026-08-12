import React from 'react';

function SearchBar({ onSearch }) {
  const handleChange = (e) => {
    onSearch(e.target.value);
  };

  return (
    <div className="search-container">
      <input
        type="text"
        className="search-input"
        placeholder="Search companies by name or symbol (e.g., NVDA, Microsoft)..."
        onChange={handleChange}
      />
    </div>
  );
}

export default SearchBar;
